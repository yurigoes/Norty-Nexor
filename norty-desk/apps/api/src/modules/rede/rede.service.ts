import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { IpView, PortaView, RedeDoAtivo, SubRedeDetail, SubRedeView, VlanView } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { cidrTexto, contem, hostsUtilizaveis, normalizarCidr, normalizarIp, normalizarMac, proximoLivre } from '../../common/ip';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  EditarIpDto,
  EditarPortaDto,
  EditarSubRedeDto,
  EditarVlanDto,
  EscreverIpDto,
  EscreverPortaDto,
  EscreverSubRedeDto,
  EscreverVlanDto,
} from './dto';

const INCLUDE_IP = {
  asset: { select: { id: true, name: true, tag: true } },
  port: { select: { id: true, name: true } },
  network: { select: { id: true, name: true, cidr: true } },
} satisfies Prisma.IpAddressInclude;
type IpComRelacoes = Prisma.IpAddressGetPayload<{ include: typeof INCLUDE_IP }>;

const VLAN = { select: { id: true, tag: true, name: true } } as const;

/** Violação de unicidade ou de CHECK vinda do banco, com o nome da regra. */
function erroDoBanco(e: unknown): { unico: boolean; regra: string } | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { unico: true, regra: String(e.meta?.target ?? '') };
  const texto = e instanceof Error ? e.message : '';
  const regra = /violates check constraint "([^"]+)"/.exec(texto)?.[1];
  return regra ? { unico: false, regra } : null;
}

/**
 * VLANs, sub-redes, IPs e portas.
 *
 * O Postgres faz o trabalho pesado: `inet` valida e normaliza, o índice
 * único barra IP duplicado, e `<<=` responde "que sub-rede contém este
 * IP?" em IPv4 e IPv6. A contagem de uso da sub-rede é por contenção, não
 * pelo vínculo gravado — IP cadastrado antes da sub-rede também conta.
 */
@Injectable()
export class RedeService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // VLAN
  // -------------------------------------------------------------------

  async vlans(usuario: UsuarioAutenticado): Promise<VlanView[]> {
    const vlans = await this.prisma.vlan.findMany({
      where: { organizationId: usuario.organizationId },
      include: { _count: { select: { networks: true, ports: true } } },
      orderBy: { tag: 'asc' },
    });
    return vlans.map((v) => ({
      id: v.id,
      tag: v.tag,
      name: v.name,
      notes: v.notes,
      networkCount: v._count.networks,
      portCount: v._count.ports,
    }));
  }

  async criarVlan(usuario: UsuarioAutenticado, dto: EscreverVlanDto): Promise<VlanView[]> {
    await this.gravando(
      () => this.prisma.vlan.create({ data: { organizationId: usuario.organizationId, tag: dto.tag, name: dto.name.trim(), notes: dto.notes ?? null } }),
      `A VLAN ${dto.tag} já existe.`,
    );
    return this.vlans(usuario);
  }

  async editarVlan(usuario: UsuarioAutenticado, id: string, dto: EditarVlanDto): Promise<VlanView[]> {
    await this.exigir('vlan', usuario, id, 'VLAN');
    await this.gravando(
      () => this.prisma.vlan.update({ where: { id }, data: { tag: dto.tag, name: dto.name?.trim(), notes: dto.notes } }),
      `A VLAN ${dto.tag} já existe.`,
    );
    return this.vlans(usuario);
  }

  async removerVlan(usuario: UsuarioAutenticado, id: string): Promise<VlanView[]> {
    await this.exigir('vlan', usuario, id, 'VLAN');
    await this.prisma.vlan.delete({ where: { id } });
    return this.vlans(usuario);
  }

  // -------------------------------------------------------------------
  // Sub-redes
  // -------------------------------------------------------------------

  async subredes(usuario: UsuarioAutenticado): Promise<SubRedeView[]> {
    const redes = await this.prisma.ipNetwork.findMany({
      where: { organizationId: usuario.organizationId },
      include: { vlan: VLAN },
      orderBy: { cidr: 'asc' },
    });
    const usos = await this.prisma.$queryRaw<{ id: string; usados: bigint }[]>(Prisma.sql`
      SELECT n.id, count(a.id) AS usados
        FROM ip_networks n
        LEFT JOIN ip_addresses a ON a."organizationId" = n."organizationId" AND a.address <<= n.cidr
       WHERE n."organizationId" = ${usuario.organizationId}::uuid
       GROUP BY n.id
    `);
    const porId = new Map(usos.map((u) => [u.id, Number(u.usados)]));
    return redes.map((r) => RedeService.subredeParaView(r, porId.get(r.id) ?? 0));
  }

  async subrede(usuario: UsuarioAutenticado, id: string): Promise<SubRedeDetail> {
    const rede = await this.prisma.ipNetwork.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: { vlan: VLAN },
    });
    if (!rede) throw new NotFoundException('Sub-rede não encontrada.');

    const ids = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM ip_addresses
       WHERE "organizationId" = ${usuario.organizationId}::uuid AND address <<= ${rede.cidr}::inet
    `);
    const ips = await this.prisma.ipAddress.findMany({ where: { id: { in: ids.map((i) => i.id) } }, include: INCLUDE_IP });
    ips.sort((a, b) => RedeService.compararIp(a.address, b.address));

    const c = normalizarCidr(rede.cidr);
    const usados = ips.map((i) => i.address);
    if (rede.gateway) usados.push(rede.gateway);
    return {
      ...RedeService.subredeParaView(rede, ips.length),
      addresses: ips.map((i) => RedeService.ipParaView(i)),
      nextFree: c ? proximoLivre(c, usados) : null,
    };
  }

  async criarSubrede(usuario: UsuarioAutenticado, dto: EscreverSubRedeDto): Promise<SubRedeDetail> {
    const c = normalizarCidr(dto.cidr);
    if (!c) throw new BadRequestException('Sub-rede inválida: use o formato 192.168.15.0/24.');
    const gateway = await this.validarGateway(dto.gateway, c);
    await this.exigirVlan(usuario, dto.vlanId);

    const rede = await this.gravando(
      () =>
        this.prisma.ipNetwork.create({
          data: {
            organizationId: usuario.organizationId,
            name: dto.name.trim(),
            cidr: cidrTexto(c),
            gateway,
            vlanId: dto.vlanId ?? null,
            notes: dto.notes ?? null,
          },
        }),
      `A sub-rede ${cidrTexto(c)} já está cadastrada.`,
    );
    // IPs cadastrados antes da sub-rede passam a apontar para ela.
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE ip_addresses SET "networkId" = ${rede.id}::uuid
       WHERE "organizationId" = ${usuario.organizationId}::uuid AND "networkId" IS NULL AND address <<= ${rede.cidr}::inet
    `);
    return this.subrede(usuario, rede.id);
  }

  async editarSubrede(usuario: UsuarioAutenticado, id: string, dto: EditarSubRedeDto): Promise<SubRedeDetail> {
    const rede = await this.exigir('ipNetwork', usuario, id, 'Sub-rede');
    const c = normalizarCidr(rede.cidr)!;
    const gateway = dto.gateway === undefined ? undefined : await this.validarGateway(dto.gateway, c);
    await this.exigirVlan(usuario, dto.vlanId);
    await this.gravando(
      () => this.prisma.ipNetwork.update({ where: { id }, data: { name: dto.name?.trim(), gateway, vlanId: dto.vlanId, notes: dto.notes } }),
      'Sub-rede já cadastrada.',
    );
    return this.subrede(usuario, id);
  }

  async removerSubrede(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.exigir('ipNetwork', usuario, id, 'Sub-rede');
    // Os IPs ficam; só perdem o vínculo (SetNull). Endereço usado não some
    // porque alguém apagou a planilha da rede.
    await this.prisma.ipNetwork.delete({ where: { id } });
  }

  // -------------------------------------------------------------------
  // IPs
  // -------------------------------------------------------------------

  async criarIp(usuario: UsuarioAutenticado, dto: EscreverIpDto): Promise<IpView> {
    const endereco = normalizarIp(dto.address);
    if (!endereco) throw new BadRequestException('Endereço IP inválido.');
    const { assetId, portId } = await this.donoDoIp(usuario, dto.assetId, dto.portId);
    const networkId = await this.redeQueContem(usuario, endereco);

    try {
      const ip = await this.prisma.ipAddress.create({
        data: {
          organizationId: usuario.organizationId,
          address: endereco,
          networkId,
          assetId,
          portId,
          fqdn: dto.fqdn?.trim().toLowerCase() || null,
          notes: dto.notes ?? null,
        },
        include: INCLUDE_IP,
      });
      return RedeService.ipParaView(ip);
    } catch (e) {
      if (erroDoBanco(e)?.unico) {
        // A briga de IP explicada: de quem é o endereço.
        const dono = await this.prisma.ipAddress.findFirst({
          where: { organizationId: usuario.organizationId, address: endereco },
          include: { asset: { select: { name: true } } },
        });
        throw new ConflictException(
          `O IP ${endereco} já está em uso${dono?.asset ? ` por ${dono.asset.name}` : ' (reservado, sem equipamento)'}.`,
        );
      }
      throw e;
    }
  }

  async editarIp(usuario: UsuarioAutenticado, id: string, dto: EditarIpDto): Promise<IpView> {
    const ip = await this.exigir('ipAddress', usuario, id, 'IP');
    const dono =
      dto.assetId === undefined && dto.portId === undefined
        ? {}
        : await this.donoDoIp(
            usuario,
            dto.assetId === undefined ? ip.assetId : dto.assetId,
            dto.portId === undefined ? ip.portId : dto.portId,
          );
    const atualizado = await this.prisma.ipAddress.update({
      where: { id },
      data: {
        ...dono,
        fqdn: dto.fqdn === undefined ? undefined : dto.fqdn?.trim().toLowerCase() || null,
        notes: dto.notes,
      },
      include: INCLUDE_IP,
    });
    return RedeService.ipParaView(atualizado);
  }

  async removerIp(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.exigir('ipAddress', usuario, id, 'IP');
    await this.prisma.ipAddress.delete({ where: { id } });
  }

  // -------------------------------------------------------------------
  // Portas (pela tela do equipamento)
  // -------------------------------------------------------------------

  async doAtivo(usuario: UsuarioAutenticado, assetId: string): Promise<RedeDoAtivo> {
    await this.exigirAtivo(usuario, assetId);
    const [portas, ips] = await Promise.all([
      this.prisma.networkPort.findMany({
        where: { assetId },
        include: {
          vlan: VLAN,
          connectedTo: { select: { id: true, name: true, asset: { select: { id: true, name: true, tag: true } } } },
          ips: { include: INCLUDE_IP },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.ipAddress.findMany({ where: { assetId, portId: null }, include: INCLUDE_IP }),
    ]);
    portas.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    return {
      ports: portas.map(
        (p): PortaView => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          mac: p.mac,
          speedMbps: p.speedMbps,
          vlan: p.vlan,
          notes: p.notes,
          connectedTo: p.connectedTo,
          ips: p.ips.map((i) => RedeService.ipParaView(i)),
        }),
      ),
      ips: ips.map((i) => RedeService.ipParaView(i)),
    };
  }

  async criarPorta(usuario: UsuarioAutenticado, assetId: string, dto: EscreverPortaDto): Promise<RedeDoAtivo> {
    await this.exigirAtivo(usuario, assetId);
    await this.exigirVlan(usuario, dto.vlanId);
    const mac = this.macOuErro(dto.mac);
    await this.gravando(
      () =>
        this.prisma.networkPort.create({
          data: {
            organizationId: usuario.organizationId,
            assetId,
            name: dto.name.trim(),
            kind: dto.kind ?? 'ETHERNET',
            mac: mac ?? null,
            speedMbps: dto.speedMbps ?? null,
            vlanId: dto.vlanId ?? null,
            notes: dto.notes ?? null,
          },
        }),
      mac ? `Já existe a porta ${dto.name.trim()} neste equipamento, ou o MAC ${mac} já está cadastrado.` : `Já existe a porta ${dto.name.trim()} neste equipamento.`,
    );
    return this.doAtivo(usuario, assetId);
  }

  async editarPorta(usuario: UsuarioAutenticado, id: string, dto: EditarPortaDto): Promise<RedeDoAtivo> {
    const porta = await this.exigir('networkPort', usuario, id, 'Porta');
    await this.exigirVlan(usuario, dto.vlanId);
    const mac = dto.mac === undefined ? undefined : this.macOuErro(dto.mac);
    await this.gravando(
      () =>
        this.prisma.networkPort.update({
          where: { id },
          data: { name: dto.name?.trim(), kind: dto.kind, mac, speedMbps: dto.speedMbps, vlanId: dto.vlanId, notes: dto.notes },
        }),
      'Nome de porta repetido neste equipamento, ou MAC já cadastrado.',
    );
    return this.doAtivo(usuario, porta.assetId);
  }

  async removerPorta(usuario: UsuarioAutenticado, id: string): Promise<RedeDoAtivo> {
    const porta = await this.exigir('networkPort', usuario, id, 'Porta');
    // O outro lado do cabo aponta para esta porta; SetNull o solta.
    await this.prisma.networkPort.delete({ where: { id } });
    return this.doAtivo(usuario, porta.assetId);
  }

  /** Liga as duas portas — gravado dos dois lados, numa transação. */
  async conectar(usuario: UsuarioAutenticado, id: string, outraId: string): Promise<RedeDoAtivo> {
    if (id === outraId) throw new BadRequestException('Uma porta não se liga a ela mesma.');
    const [a, b] = await Promise.all([
      this.prisma.networkPort.findFirst({ where: { id, organizationId: usuario.organizationId }, include: { asset: { select: { name: true } } } }),
      this.prisma.networkPort.findFirst({ where: { id: outraId, organizationId: usuario.organizationId }, include: { asset: { select: { name: true } } } }),
    ]);
    if (!a || !b) throw new NotFoundException('Porta não encontrada.');
    if (a.assetId === b.assetId) throw new BadRequestException('Ligue a porta a outro equipamento.');
    if (a.connectedToId === b.id && b.connectedToId === a.id) return this.doAtivo(usuario, a.assetId);
    for (const p of [a, b]) {
      if (p.connectedToId) {
        throw new ConflictException(`A porta ${p.name} de ${p.asset.name} já está ligada a outra — desligue antes.`);
      }
    }
    await this.prisma.$transaction([
      this.prisma.networkPort.update({ where: { id: a.id }, data: { connectedToId: b.id } }),
      this.prisma.networkPort.update({ where: { id: b.id }, data: { connectedToId: a.id } }),
    ]);
    return this.doAtivo(usuario, a.assetId);
  }

  async desconectar(usuario: UsuarioAutenticado, id: string): Promise<RedeDoAtivo> {
    const porta = await this.exigir('networkPort', usuario, id, 'Porta');
    await this.prisma.networkPort.updateMany({
      where: { organizationId: usuario.organizationId, OR: [{ id }, { connectedToId: id }] },
      data: { connectedToId: null },
    });
    return this.doAtivo(usuario, porta.assetId);
  }

  // -------------------------------------------------------------------

  static subredeParaView(
    r: { id: string; name: string; cidr: string; gateway: string | null; notes: string | null; vlan: { id: string; tag: number; name: string } | null },
    usados: number,
  ): SubRedeView {
    const c = normalizarCidr(r.cidr);
    const total = c ? hostsUtilizaveis(c) : null;
    return {
      id: r.id,
      name: r.name,
      cidr: r.cidr,
      gateway: r.gateway,
      vlan: r.vlan,
      notes: r.notes,
      total,
      used: usados,
      percent: total ? Math.round((usados / total) * 100) : null,
    };
  }

  static ipParaView(i: IpComRelacoes): IpView {
    return { id: i.id, address: i.address, fqdn: i.fqdn, notes: i.notes, asset: i.asset, port: i.port, network: i.network };
  }

  /** IPv4 em ordem numérica ("10.0.0.9" antes de "10.0.0.10"); IPv6 depois, em texto. */
  static compararIp(a: string, b: string): number {
    const num = (ip: string) => (ip.includes(':') ? Number.MAX_SAFE_INTEGER : ip.split('.').reduce((s, p) => s * 256 + Number(p), 0));
    return num(a) - num(b) || a.localeCompare(b);
  }

  private macOuErro(mac: string | null | undefined): string | null | undefined {
    if (mac === undefined || mac === null) return mac;
    const normal = normalizarMac(mac);
    if (!normal) throw new BadRequestException('MAC inválido: 12 dígitos hexadecimais, como aa:bb:cc:dd:ee:ff.');
    return normal;
  }

  private async validarGateway(gateway: string | null | undefined, c: ReturnType<typeof normalizarCidr> & object): Promise<string | null> {
    if (!gateway) return null;
    const g = normalizarIp(gateway);
    if (!g) throw new BadRequestException('Gateway inválido.');
    if (c.familia === 4 && !contem(c, g)) throw new BadRequestException(`O gateway ${g} não está dentro de ${cidrTexto(c)}.`);
    return g;
  }

  private async redeQueContem(usuario: UsuarioAutenticado, endereco: string): Promise<string | null> {
    const [rede] = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM ip_networks
       WHERE "organizationId" = ${usuario.organizationId}::uuid AND ${endereco}::inet <<= cidr
       ORDER BY masklen(cidr) DESC
       LIMIT 1
    `);
    return rede?.id ?? null;
  }

  /** A porta decide o equipamento; sem porta, o equipamento informado (ou nenhum: IP reservado). */
  private async donoDoIp(usuario: UsuarioAutenticado, assetId?: string | null, portId?: string | null) {
    if (portId) {
      const porta = await this.prisma.networkPort.findFirst({ where: { id: portId, organizationId: usuario.organizationId } });
      if (!porta) throw new NotFoundException('Porta não encontrada.');
      if (assetId && assetId !== porta.assetId) throw new BadRequestException('A porta é de outro equipamento.');
      return { assetId: porta.assetId, portId };
    }
    if (assetId) await this.exigirAtivo(usuario, assetId);
    return { assetId: assetId ?? null, portId: null };
  }

  private async exigirAtivo(usuario: UsuarioAutenticado, id: string) {
    if (!(await this.prisma.asset.count({ where: { id, organizationId: usuario.organizationId } }))) {
      throw new NotFoundException('Equipamento não encontrado.');
    }
  }

  private async exigirVlan(usuario: UsuarioAutenticado, id: string | null | undefined) {
    if (id && !(await this.prisma.vlan.count({ where: { id, organizationId: usuario.organizationId } }))) {
      throw new NotFoundException('VLAN não encontrada.');
    }
  }

  private async exigir<M extends 'vlan' | 'ipNetwork' | 'ipAddress' | 'networkPort'>(
    modelo: M,
    usuario: UsuarioAutenticado,
    id: string,
    rotulo: string,
  ) {
    // Os quatro modelos têm organizationId; o cast mantém o tipo de cada um.
    const achado = await (this.prisma[modelo] as unknown as { findFirst: (a: unknown) => Promise<unknown> }).findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!achado) throw new NotFoundException(`${rotulo} não encontrada.`);
    return achado as M extends 'vlan'
      ? Prisma.VlanGetPayload<object>
      : M extends 'ipNetwork'
        ? Prisma.IpNetworkGetPayload<object>
        : M extends 'ipAddress'
          ? Prisma.IpAddressGetPayload<object>
          : Prisma.NetworkPortGetPayload<object>;
  }

  private async gravando<T>(operacao: () => Promise<T>, mensagemDeDuplicata: string): Promise<T> {
    try {
      return await operacao();
    } catch (e) {
      const erro = erroDoBanco(e);
      if (erro?.unico) throw new ConflictException(mensagemDeDuplicata);
      if (erro) throw new BadRequestException(`Valor recusado pelo banco (${erro.regra}).`);
      throw e;
    }
  }
}
