import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  can,
  type AtribuicaoView,
  type InstalacaoView,
  type LicencaView,
  type SituacaoDaLicenca,
  type SoftwareDetail,
  type SoftwareDoAtivo,
  type SoftwareView,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { cifrar, decifrar } from '../channels/segredos';
import type {
  AtribuirLicencaDto,
  BuscarSoftwareDto,
  EditarLicencaDto,
  EditarSoftwareDto,
  EscreverLicencaDto,
  EscreverSoftwareDto,
  InstalarSoftwareDto,
} from './dto';

const DIA = 24 * 3600 * 1000;
/** Com quantos dias de antecedência uma licença conta como "vencendo". */
const AVISO_DIAS = 30;

const INCLUDE_SOFTWARE = {
  manufacturer: { select: { id: true, name: true } },
  versions: {
    select: {
      id: true,
      name: true,
      installations: { select: { assetId: true, asset: { select: { userId: true } } } },
    },
    orderBy: { name: 'asc' },
  },
  licenses: {
    select: { seats: true, expiresAt: true, assignments: { select: { assetId: true, userId: true } } },
  },
} satisfies Prisma.SoftwareInclude;
type SoftwareComRelacoes = Prisma.SoftwareGetPayload<{ include: typeof INCLUDE_SOFTWARE }>;

const INCLUDE_LICENCA = {
  software: { select: { id: true, name: true } },
  version: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  contract: { select: { id: true, number: true, name: true } },
  assignments: {
    include: {
      asset: { select: { id: true, name: true, tag: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { assignedAt: 'asc' },
  },
} satisfies Prisma.SoftwareLicenseInclude;
type LicencaComRelacoes = Prisma.SoftwareLicenseGetPayload<{ include: typeof INCLUDE_LICENCA }>;

const INCLUDE_INSTALACAO = {
  version: { select: { id: true, name: true, software: { select: { id: true, name: true } } } },
  asset: { select: { id: true, name: true, tag: true, userId: true } },
} satisfies Prisma.SoftwareInstallationInclude;
type InstalacaoComRelacoes = Prisma.SoftwareInstallationGetPayload<{ include: typeof INCLUDE_INSTALACAO }>;

/** Quem ocupa assento de algum software: equipamentos e pessoas. */
type Cobertura = { ativos: Set<string>; pessoas: Set<string> };

/**
 * Software e licenças — o que existe, onde está instalado, o que foi
 * comprado e quem ocupa cada assento.
 *
 * A conformidade é por **software**, não por versão, como a leitura que o
 * GLPI faz na prática: uma instalação está coberta se o equipamento ocupa
 * um assento de alguma licença daquele software — ou se a pessoa que usa
 * o equipamento ocupa (licença nominal, como Microsoft 365).
 */
@Injectable()
export class SoftwareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // -------------------------------------------------------------------
  // Software
  // -------------------------------------------------------------------

  async listar(usuario: UsuarioAutenticado, filtro: BuscarSoftwareDto): Promise<SoftwareView[]> {
    const termo = filtro.q?.trim();
    const lista = await this.prisma.software.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(filtro.incluirInativos ? {} : { isActive: true }),
        ...(termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' } },
                { category: { contains: termo, mode: 'insensitive' } },
                { manufacturer: { name: { contains: termo, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: INCLUDE_SOFTWARE,
      orderBy: { name: 'asc' },
      take: 500,
    });
    return lista.map((s) => SoftwareService.resumo(s));
  }

  async detalhe(usuario: UsuarioAutenticado, id: string): Promise<SoftwareDetail> {
    const software = await this.prisma.software.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE_SOFTWARE,
    });
    if (!software) throw new NotFoundException('Software não encontrado.');

    const [licencas, instalacoes] = await Promise.all([
      this.prisma.softwareLicense.findMany({
        where: { softwareId: id },
        include: INCLUDE_LICENCA,
        orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
      this.prisma.softwareInstallation.findMany({
        where: { version: { softwareId: id } },
        include: INCLUDE_INSTALACAO,
        orderBy: [{ asset: { name: 'asc' } }, { version: { name: 'asc' } }],
      }),
    ]);

    const cobertura = SoftwareService.coberturaDe(licencas);
    const verChave = can(usuario.role, 'ativo:gerenciar');

    return {
      ...SoftwareService.resumo(software),
      versions: software.versions.map((v) => ({
        id: v.id,
        name: v.name,
        installCount: v.installations.length,
      })),
      installations: instalacoes.map((i) =>
        SoftwareService.instalacaoParaView(i, SoftwareService.cobre(cobertura, i.asset)),
      ),
      licenses: licencas.map((l) => SoftwareService.licencaParaView(l, verChave)),
    };
  }

  async criar(usuario: UsuarioAutenticado, dto: EscreverSoftwareDto, ip?: string): Promise<SoftwareDetail> {
    await this.exigirDaOrganizacao(usuario, 'manufacturer', dto.manufacturerId, 'Fabricante');
    await this.exigirNomeLivre(usuario, dto.name, dto.manufacturerId ?? null);
    const software = await SoftwareService.semDuplicata(
      () =>
        this.prisma.software.create({
          data: {
            organizationId: usuario.organizationId,
            name: dto.name.trim(),
            manufacturerId: dto.manufacturerId ?? null,
            category: dto.category?.trim() || null,
            notes: dto.notes ?? null,
            isActive: dto.isActive ?? true,
          },
        }),
      'Já existe um software com este nome e fabricante.',
    );
    await this.auditoria.registrar(usuario, {
      action: 'software.criado',
      entity: 'Software',
      entityId: software.id,
      ip,
      depois: { name: software.name, manufacturerId: software.manufacturerId, category: software.category },
    });
    return this.detalhe(usuario, software.id);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarSoftwareDto,
    ip?: string,
  ): Promise<SoftwareDetail> {
    const antes = await this.exigirSoftware(usuario, id);
    await this.exigirDaOrganizacao(usuario, 'manufacturer', dto.manufacturerId, 'Fabricante');
    await this.exigirNomeLivre(
      usuario,
      dto.name ?? antes.name,
      dto.manufacturerId === undefined ? antes.manufacturerId : dto.manufacturerId,
      id,
    );
    const depois = await SoftwareService.semDuplicata(
      () =>
        this.prisma.software.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            manufacturerId: dto.manufacturerId,
            category: dto.category === undefined ? undefined : dto.category?.trim() || null,
            notes: dto.notes,
            isActive: dto.isActive,
          },
        }),
      'Já existe um software com este nome e fabricante.',
    );
    await this.auditoria.registrar(usuario, {
      action: 'software.editado',
      entity: 'Software',
      entityId: id,
      ip,
      antes: { name: antes.name, manufacturerId: antes.manufacturerId, category: antes.category, isActive: antes.isActive },
      depois: { name: depois.name, manufacturerId: depois.manufacturerId, category: depois.category, isActive: depois.isActive },
    });
    return this.detalhe(usuario, id);
  }

  /**
   * Excluir só o que nunca foi usado. Com instalação ou licença, o
   * caminho é desativar: apagar levaria junto o histórico de quem
   * comprou o quê — exatamente o que a auditoria de licença pergunta.
   */
  async remover(usuario: UsuarioAutenticado, id: string, ip?: string): Promise<void> {
    const software = await this.exigirSoftware(usuario, id);
    const [instalacoes, licencas] = await Promise.all([
      this.prisma.softwareInstallation.count({ where: { version: { softwareId: id } } }),
      this.prisma.softwareLicense.count({ where: { softwareId: id } }),
    ]);
    if (instalacoes || licencas) {
      throw new ConflictException(
        `Este software tem ${instalacoes} instalação(ões) e ${licencas} licença(s): desative em vez de excluir.`,
      );
    }
    await this.prisma.software.delete({ where: { id } });
    await this.auditoria.registrar(usuario, {
      action: 'software.excluido',
      entity: 'Software',
      entityId: id,
      ip,
      antes: { name: software.name },
    });
  }

  // -------------------------------------------------------------------
  // Versões
  // -------------------------------------------------------------------

  async criarVersao(usuario: UsuarioAutenticado, softwareId: string, nome: string): Promise<SoftwareDetail> {
    await this.exigirSoftware(usuario, softwareId);
    await SoftwareService.semDuplicata(
      () => this.prisma.softwareVersion.create({ data: { softwareId, name: nome.trim() } }),
      'Esta versão já existe.',
    );
    return this.detalhe(usuario, softwareId);
  }

  async removerVersao(usuario: UsuarioAutenticado, softwareId: string, versionId: string): Promise<SoftwareDetail> {
    await this.exigirSoftware(usuario, softwareId);
    const versao = await this.prisma.softwareVersion.findFirst({
      where: { id: versionId, softwareId },
      include: { _count: { select: { installations: true } } },
    });
    if (!versao) throw new NotFoundException('Versão não encontrada.');
    if (versao._count.installations) {
      throw new ConflictException(
        `A versão ${versao.name} está instalada em ${versao._count.installations} equipamento(s): desinstale antes.`,
      );
    }
    await this.prisma.softwareVersion.delete({ where: { id: versionId } });
    return this.detalhe(usuario, softwareId);
  }

  // -------------------------------------------------------------------
  // Instalações (pela tela do equipamento)
  // -------------------------------------------------------------------

  async doAtivo(usuario: UsuarioAutenticado, assetId: string): Promise<SoftwareDoAtivo> {
    const ativo = await this.exigirAtivo(usuario, assetId);

    const [instalacoes, atribuicoes] = await Promise.all([
      this.prisma.softwareInstallation.findMany({
        where: { assetId },
        include: INCLUDE_INSTALACAO,
        orderBy: [{ version: { software: { name: 'asc' } } }, { version: { name: 'asc' } }],
      }),
      this.prisma.licenseAssignment.findMany({
        where: {
          license: { organizationId: usuario.organizationId },
          OR: [{ assetId }, ...(ativo.userId ? [{ userId: ativo.userId }] : [])],
        },
        include: {
          license: {
            select: { id: true, name: true, kind: true, expiresAt: true, software: { select: { id: true, name: true } } },
          },
        },
        orderBy: { assignedAt: 'asc' },
      }),
    ]);

    const cobertos = new Set(atribuicoes.map((a) => a.license.software.id));

    return {
      installations: instalacoes.map((i) =>
        SoftwareService.instalacaoParaView(i, cobertos.has(i.version.software.id)),
      ),
      // Só os assentos do próprio equipamento: o da pessoa é liberado na
      // tela do software, não aqui — tirar daqui tiraria dela em todas as
      // máquinas.
      licenses: atribuicoes
        .filter((a) => a.assetId === assetId)
        .map((a) => ({
          assignmentId: a.id,
          license: {
            id: a.license.id,
            name: a.license.name,
            kind: a.license.kind,
            expiresAt: a.license.expiresAt?.toISOString() ?? null,
          },
          software: a.license.software,
        })),
    };
  }

  async instalar(usuario: UsuarioAutenticado, assetId: string, dto: InstalarSoftwareDto): Promise<SoftwareDoAtivo> {
    await this.exigirAtivo(usuario, assetId);
    await this.exigirSoftware(usuario, dto.softwareId);

    // Instalar pelo nome da versão, criando-a se for nova: é assim que
    // o suporte lê a tela do computador ("Office 2021"), e obrigar a
    // cadastrar a versão antes era um passo que ninguém faria.
    const versao = await this.prisma.softwareVersion.upsert({
      where: { softwareId_name: { softwareId: dto.softwareId, name: dto.version.trim() } },
      create: { softwareId: dto.softwareId, name: dto.version.trim() },
      update: {},
    });

    await SoftwareService.semDuplicata(
      () =>
        this.prisma.softwareInstallation.create({
          data: {
            assetId,
            versionId: versao.id,
            installedAt: dto.installedAt ? new Date(dto.installedAt) : null,
          },
        }),
      'Esta versão já está instalada neste equipamento.',
    );
    return this.doAtivo(usuario, assetId);
  }

  async desinstalar(usuario: UsuarioAutenticado, assetId: string, installationId: string): Promise<SoftwareDoAtivo> {
    await this.exigirAtivo(usuario, assetId);
    const apagadas = await this.prisma.softwareInstallation.deleteMany({
      where: { id: installationId, assetId },
    });
    if (!apagadas.count) throw new NotFoundException('Instalação não encontrada.');
    return this.doAtivo(usuario, assetId);
  }

  // -------------------------------------------------------------------
  // Licenças
  // -------------------------------------------------------------------

  async criarLicenca(
    usuario: UsuarioAutenticado,
    softwareId: string,
    dto: EscreverLicencaDto,
    ip?: string,
  ): Promise<SoftwareDetail> {
    await this.exigirSoftware(usuario, softwareId);
    await this.exigirReferenciasDaLicenca(usuario, softwareId, dto);

    const chave = dto.licenseKey?.trim();
    const licenca = await this.prisma.softwareLicense.create({
      data: {
        organizationId: usuario.organizationId,
        softwareId,
        versionId: dto.versionId ?? null,
        name: dto.name.trim(),
        kind: dto.kind ?? 'PERPETUA',
        licenseKey: chave ? cifrar(chave) : null,
        seats: dto.seats ?? null,
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        purchaseValue: dto.purchaseValue ?? null,
        supplierId: dto.supplierId ?? null,
        contractId: dto.contractId ?? null,
        notes: dto.notes ?? null,
      },
    });

    await this.auditoria.registrar(usuario, {
      action: 'licenca.criada',
      entity: 'SoftwareLicense',
      entityId: licenca.id,
      ip,
      depois: SoftwareService.paraAuditoria(licenca),
    });
    return this.detalhe(usuario, softwareId);
  }

  async editarLicenca(
    usuario: UsuarioAutenticado,
    licenseId: string,
    dto: EditarLicencaDto,
    ip?: string,
  ): Promise<SoftwareDetail> {
    const antes = await this.exigirLicenca(usuario, licenseId);
    await this.exigirReferenciasDaLicenca(usuario, antes.softwareId, dto);

    const chave = dto.licenseKey === undefined ? undefined : dto.licenseKey?.trim() || null;
    const depois = await this.prisma.softwareLicense.update({
      where: { id: licenseId },
      data: {
        name: dto.name?.trim(),
        kind: dto.kind,
        versionId: dto.versionId,
        ...(chave === undefined ? {} : { licenseKey: chave ? cifrar(chave) : null }),
        seats: dto.seats,
        purchasedAt: dto.purchasedAt === undefined ? undefined : dto.purchasedAt ? new Date(dto.purchasedAt) : null,
        expiresAt: dto.expiresAt === undefined ? undefined : dto.expiresAt ? new Date(dto.expiresAt) : null,
        purchaseValue: dto.purchaseValue,
        supplierId: dto.supplierId,
        contractId: dto.contractId,
        notes: dto.notes,
      },
    });

    // O diff registra que a chave mudou, nunca a chave.
    await this.auditoria.registrar(usuario, {
      action: 'licenca.editada',
      entity: 'SoftwareLicense',
      entityId: licenseId,
      ip,
      antes: { ...SoftwareService.paraAuditoria(antes), chaveTrocada: false },
      depois: { ...SoftwareService.paraAuditoria(depois), chaveTrocada: chave !== undefined },
    });
    return this.detalhe(usuario, antes.softwareId);
  }

  async removerLicenca(usuario: UsuarioAutenticado, licenseId: string, ip?: string): Promise<SoftwareDetail> {
    const licenca = await this.exigirLicenca(usuario, licenseId);
    await this.prisma.softwareLicense.delete({ where: { id: licenseId } });
    await this.auditoria.registrar(usuario, {
      action: 'licenca.excluida',
      entity: 'SoftwareLicense',
      entityId: licenseId,
      ip,
      antes: { ...SoftwareService.paraAuditoria(licenca), assentosOcupados: licenca._count.assignments },
    });
    return this.detalhe(usuario, licenca.softwareId);
  }

  /**
   * Ocupar um assento. Sem assento livre, recusa: é na hora de atribuir
   * que a falta aparece — depois, ela aparece na auditoria do fabricante.
   */
  async atribuir(usuario: UsuarioAutenticado, licenseId: string, dto: AtribuirLicencaDto): Promise<SoftwareDetail> {
    if (Boolean(dto.assetId) === Boolean(dto.userId)) {
      throw new BadRequestException('Informe o equipamento ou a pessoa — um dos dois.');
    }
    const licenca = await this.exigirLicenca(usuario, licenseId);
    if (licenca.seats !== null && licenca._count.assignments >= licenca.seats) {
      throw new ConflictException(
        `Sem assento livre nesta licença: ${licenca._count.assignments} de ${licenca.seats} ocupados.`,
      );
    }
    if (dto.assetId) await this.exigirAtivo(usuario, dto.assetId);
    if (dto.userId) await this.exigirPessoa(usuario, dto.userId);

    await SoftwareService.semDuplicata(
      () =>
        this.prisma.licenseAssignment.create({
          data: { licenseId, assetId: dto.assetId ?? null, userId: dto.userId ?? null },
        }),
      dto.assetId ? 'Este equipamento já ocupa um assento desta licença.' : 'Esta pessoa já ocupa um assento desta licença.',
    );
    return this.detalhe(usuario, licenca.softwareId);
  }

  async liberar(usuario: UsuarioAutenticado, licenseId: string, assignmentId: string): Promise<SoftwareDetail> {
    const licenca = await this.exigirLicenca(usuario, licenseId);
    const apagadas = await this.prisma.licenseAssignment.deleteMany({ where: { id: assignmentId, licenseId } });
    if (!apagadas.count) throw new NotFoundException('Assento não encontrado.');
    return this.detalhe(usuario, licenca.softwareId);
  }

  /** Vencidas e vencendo nos próximos `dias` — o aviso da lista de software. */
  async vencendo(usuario: UsuarioAutenticado, dias = AVISO_DIAS): Promise<LicencaView[]> {
    const licencas = await this.prisma.softwareLicense.findMany({
      where: {
        organizationId: usuario.organizationId,
        expiresAt: { lte: new Date(Date.now() + dias * DIA) },
        software: { isActive: true },
      },
      include: INCLUDE_LICENCA,
      orderBy: { expiresAt: 'asc' },
      take: 100,
    });
    return licencas.map((l) => SoftwareService.licencaParaView(l, false));
  }

  // -------------------------------------------------------------------
  // Visões
  // -------------------------------------------------------------------

  static resumo(s: SoftwareComRelacoes): SoftwareView {
    // Equipamentos com o software (qualquer versão) e quem os usa.
    const instalados = new Map<string, string | null>();
    for (const v of s.versions) for (const i of v.installations) instalados.set(i.assetId, i.asset.userId);

    const cobertura: Cobertura = { ativos: new Set(), pessoas: new Set() };
    let usados = 0;
    let comprados: number | null = 0;
    for (const l of s.licenses) {
      usados += l.assignments.length;
      comprados = comprados === null || l.seats === null ? null : comprados + l.seats;
      for (const a of l.assignments) {
        if (a.assetId) cobertura.ativos.add(a.assetId);
        if (a.userId) cobertura.pessoas.add(a.userId);
      }
    }

    let semLicenca = 0;
    for (const [assetId, userId] of instalados) {
      if (!SoftwareService.cobre(cobertura, { id: assetId, userId })) semLicenca++;
    }

    const validades = s.licenses
      .map((l) => l.expiresAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      id: s.id,
      name: s.name,
      category: s.category,
      manufacturer: s.manufacturer,
      isActive: s.isActive,
      notes: s.notes,
      versionCount: s.versions.length,
      installCount: instalados.size,
      seats: comprados,
      seatsUsed: usados,
      unlicensedInstalls: semLicenca,
      nextExpiry: validades[0]?.toISOString() ?? null,
    };
  }

  static situacao(
    l: { seats: number | null; expiresAt: Date | null },
    ocupados: number,
    agora = Date.now(),
  ): SituacaoDaLicenca {
    if (l.seats !== null && ocupados > l.seats) return 'excedida';
    if (l.expiresAt && l.expiresAt.getTime() < agora) return 'vencida';
    if (l.expiresAt && l.expiresAt.getTime() - agora <= AVISO_DIAS * DIA) return 'vencendo';
    return 'ok';
  }

  static licencaParaView(l: LicencaComRelacoes, verChave: boolean): LicencaView {
    let chave: string | null = null;
    if (verChave && l.licenseKey) {
      try {
        chave = decifrar(l.licenseKey);
      } catch {
        // CHANNEL_SECRET_KEY trocada desde que a chave foi salva: a tela
        // mostra que existe, sem conseguir mostrar qual.
        chave = null;
      }
    }

    return {
      id: l.id,
      software: l.software,
      name: l.name,
      kind: l.kind,
      version: l.version,
      seats: l.seats,
      seatsUsed: l.assignments.length,
      purchasedAt: l.purchasedAt?.toISOString() ?? null,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      purchaseValue: l.purchaseValue?.toFixed(2) ?? null,
      supplier: l.supplier,
      contract: l.contract,
      notes: l.notes,
      situacao: SoftwareService.situacao(l, l.assignments.length),
      hasKey: Boolean(l.licenseKey),
      ...(verChave ? { licenseKey: chave } : {}),
      assignments: l.assignments.map(
        (a): AtribuicaoView => ({
          id: a.id,
          assignedAt: a.assignedAt.toISOString(),
          asset: a.asset,
          user: a.user,
        }),
      ),
    };
  }

  private static instalacaoParaView(i: InstalacaoComRelacoes, licenciada: boolean): InstalacaoView {
    return {
      id: i.id,
      installedAt: i.installedAt?.toISOString() ?? null,
      software: i.version.software,
      version: { id: i.version.id, name: i.version.name },
      asset: { id: i.asset.id, name: i.asset.name, tag: i.asset.tag },
      licensed: licenciada,
    };
  }

  private static coberturaDe(licencas: { assignments: { assetId: string | null; userId: string | null }[] }[]): Cobertura {
    const cobertura: Cobertura = { ativos: new Set(), pessoas: new Set() };
    for (const l of licencas) {
      for (const a of l.assignments) {
        if (a.assetId) cobertura.ativos.add(a.assetId);
        if (a.userId) cobertura.pessoas.add(a.userId);
      }
    }
    return cobertura;
  }

  private static cobre(cobertura: Cobertura, ativo: { id: string; userId: string | null }): boolean {
    return cobertura.ativos.has(ativo.id) || (ativo.userId !== null && cobertura.pessoas.has(ativo.userId));
  }

  private static paraAuditoria(l: {
    name: string;
    kind: string;
    seats: number | null;
    expiresAt: Date | null;
    versionId: string | null;
    supplierId: string | null;
    contractId: string | null;
    licenseKey: string | null;
  }) {
    return {
      name: l.name,
      kind: l.kind,
      seats: l.seats,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      versionId: l.versionId,
      supplierId: l.supplierId,
      contractId: l.contractId,
      temChave: Boolean(l.licenseKey),
    };
  }

  private static async semDuplicata<T>(operacao: () => Promise<T>, mensagem: string): Promise<T> {
    try {
      return await operacao();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(mensagem);
      }
      throw e;
    }
  }

  // -------------------------------------------------------------------
  // Tudo tem de ser da organização de quem pede
  // -------------------------------------------------------------------

  private async exigirSoftware(usuario: UsuarioAutenticado, id: string) {
    const software = await this.prisma.software.findFirst({ where: { id, organizationId: usuario.organizationId } });
    if (!software) throw new NotFoundException('Software não encontrado.');
    return software;
  }

  /**
   * O índice único (organização, fabricante, nome) não pega dois "Office"
   * sem fabricante — no Postgres, NULL é diferente de NULL — nem "Office" e
   * "office". Os dois são o mesmo software para quem conta licença, e
   * duplicado divide as instalações entre dois registros.
   */
  private async exigirNomeLivre(
    usuario: UsuarioAutenticado,
    nome: string,
    manufacturerId: string | null,
    ignorarId?: string,
  ): Promise<void> {
    const existente = await this.prisma.software.findFirst({
      where: {
        organizationId: usuario.organizationId,
        name: { equals: nome.trim(), mode: 'insensitive' },
        manufacturerId,
        ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
      },
      select: { name: true },
    });
    if (existente) {
      throw new ConflictException(
        manufacturerId
          ? `Já existe "${existente.name}" deste fabricante.`
          : `Já existe "${existente.name}" sem fabricante — use esse, ou informe o fabricante.`,
      );
    }
  }

  private async exigirLicenca(usuario: UsuarioAutenticado, id: string) {
    const licenca = await this.prisma.softwareLicense.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: { _count: { select: { assignments: true } } },
    });
    if (!licenca) throw new NotFoundException('Licença não encontrada.');
    return licenca;
  }

  private async exigirAtivo(usuario: UsuarioAutenticado, id: string) {
    const ativo = await this.prisma.asset.findFirst({
      where: { id, organizationId: usuario.organizationId },
      select: { id: true, userId: true },
    });
    if (!ativo) throw new NotFoundException('Equipamento não encontrado.');
    return ativo;
  }

  private async exigirPessoa(usuario: UsuarioAutenticado, userId: string): Promise<void> {
    const existe = await this.prisma.membership.count({
      where: { userId, organizationId: usuario.organizationId },
    });
    if (!existe) throw new NotFoundException('Pessoa não encontrada nesta organização.');
  }

  private async exigirDaOrganizacao(
    usuario: UsuarioAutenticado,
    qual: 'manufacturer' | 'supplier' | 'contract',
    id: string | null | undefined,
    rotulo: string,
  ): Promise<void> {
    if (!id) return;
    const where = { id, organizationId: usuario.organizationId };
    const existe =
      qual === 'manufacturer'
        ? await this.prisma.manufacturer.count({ where })
        : qual === 'supplier'
          ? await this.prisma.supplier.count({ where })
          : await this.prisma.contract.count({ where });
    if (!existe) throw new NotFoundException(`${rotulo} não encontrado nesta organização.`);
  }

  private async exigirReferenciasDaLicenca(
    usuario: UsuarioAutenticado,
    softwareId: string,
    dto: { versionId?: string | null; supplierId?: string | null; contractId?: string | null },
  ): Promise<void> {
    if (dto.versionId) {
      const existe = await this.prisma.softwareVersion.count({ where: { id: dto.versionId, softwareId } });
      if (!existe) throw new NotFoundException('Versão não encontrada neste software.');
    }
    await this.exigirDaOrganizacao(usuario, 'supplier', dto.supplierId, 'Fornecedor');
    await this.exigirDaOrganizacao(usuario, 'contract', dto.contractId, 'Contrato');
  }
}
