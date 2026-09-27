import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  FabricanteView,
  LocalizacaoView,
  ModeloDeAtivoView,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DicionarioDeFabricante } from './fabricantes.dicionario';
import type {
  EscreverFabricanteDto,
  EscreverLocalizacaoDto,
  EscreverModeloDeAtivoDto,
} from './dto';

/** Teto da subida na árvore. Ciclo no banco não vira laço infinito aqui. */
const MAX_NIVEIS = 20;

/** Nome comparável: sem espaço nas pontas e sem caixa. */
const dobrar = (nome: string): string => nome.trim().toLocaleLowerCase('pt-BR');

/**
 * O catálogo que o ativo referencia.
 *
 * Localização, fabricante e modelo eram texto livre no ativo, e texto
 * livre é a origem da sujeira de inventário: "HP", "hp" e
 * "Hewlett-Packard" são três fabricantes para quem conta e um só para
 * quem olha.
 *
 * O modelo de equipamento é **um** modelo com discriminador. O GLPI tem
 * uma tabela por tipo — `computermodels`, `monitormodels`,
 * `printermodels` e mais três —, todas com as mesmas quatro colunas.
 */
@Injectable()
export class CatalogoDoAtivoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly dicionario: DicionarioDeFabricante,
  ) {}

  // -------------------------------------------------------------------
  // Localização
  // -------------------------------------------------------------------

  async localizacoes(usuario: UsuarioAutenticado): Promise<LocalizacaoView[]> {
    const locais = await this.prisma.location.findMany({
      where: { organizationId: usuario.organizationId },
      include: { _count: { select: { assets: true } } },
    });

    const caminhos = CatalogoDoAtivoService.caminhos(locais);

    return locais
      .map((l) => ({
        id: l.id,
        name: l.name,
        path: caminhos.get(l.id) ?? l.name,
        parentId: l.parentId,
        notes: l.notes,
        isActive: l.isActive,
        assetCount: l._count.assets,
      }))
      // Ordena pelo caminho: a lista sai como a árvore se lê, e a filha
      // aparece logo abaixo do pai sem a tela precisar montar nada.
      .sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
  }

  async criarLocalizacao(
    usuario: UsuarioAutenticado,
    dto: EscreverLocalizacaoDto,
  ): Promise<LocalizacaoView[]> {
    await this.exigirPai(usuario, dto.parentId);
    await this.exigirNomeLivre('location', usuario, dto.name, { parentId: dto.parentId ?? null });

    try {
      const criada = await this.prisma.location.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          parentId: dto.parentId ?? null,
          notes: dto.notes ?? null,
          isActive: dto.isActive ?? true,
        },
      });

      await this.auditoria.registrar(usuario, {
        action: 'localizacao.criada',
        entity: 'Location',
        entityId: criada.id,
        depois: { name: dto.name },
      });
    } catch (erro) {
      throw CatalogoDoAtivoService.traduzirDuplicidade(erro, `localização "${dto.name}"`);
    }

    return this.localizacoes(usuario);
  }

  async editarLocalizacao(
    usuario: UsuarioAutenticado,
    id: string,
    dto: Partial<EscreverLocalizacaoDto>,
  ): Promise<LocalizacaoView[]> {
    const atual = await this.prisma.location.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!atual) throw new NotFoundException('Localização não encontrada.');

    if (dto.parentId !== undefined && dto.parentId !== atual.parentId) {
      await this.exigirPai(usuario, dto.parentId);
      await this.exigirSemCiclo(usuario, id, dto.parentId);
    }

    await this.exigirNomeLivre(
      'location',
      usuario,
      dto.name ?? atual.name,
      { parentId: dto.parentId === undefined ? atual.parentId : (dto.parentId ?? null) },
      id,
    );

    try {
      await this.prisma.location.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.parentId === undefined ? {} : { parentId: dto.parentId }),
          ...(dto.notes === undefined ? {} : { notes: dto.notes }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      });
    } catch (erro) {
      throw CatalogoDoAtivoService.traduzirDuplicidade(
        erro,
        `localização "${dto.name ?? atual.name}"`,
      );
    }

    return this.localizacoes(usuario);
  }

  async removerLocalizacao(usuario: UsuarioAutenticado, id: string): Promise<LocalizacaoView[]> {
    const local = await this.prisma.location.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: { _count: { select: { assets: true, children: true } } },
    });
    if (!local) throw new NotFoundException('Localização não encontrada.');

    if (local._count.children > 0) {
      throw new ConflictException(
        'Esta localização tem sublocalizações. Mova-as antes de apagá-la.',
      );
    }

    // Ativo aqui dentro não impede: o `SET NULL` da relação deixa o
    // equipamento sem local, que é melhor que recusar e deixar a árvore
    // presa a um prédio que a empresa não ocupa mais.
    await this.prisma.location.delete({ where: { id } });

    await this.auditoria.registrar(usuario, {
      action: 'localizacao.removida',
      entity: 'Location',
      entityId: id,
      antes: { name: local.name, ativos: local._count.assets },
    });

    return this.localizacoes(usuario);
  }

  // -------------------------------------------------------------------
  // Fabricante e modelo
  // -------------------------------------------------------------------

  async fabricantes(usuario: UsuarioAutenticado): Promise<FabricanteView[]> {
    const fabricantes = await this.prisma.manufacturer.findMany({
      where: { organizationId: usuario.organizationId },
      include: {
        _count: { select: { models: true, assets: true } },
        aliases: { orderBy: { alias: 'asc' }, select: { id: true, alias: true } },
      },
      orderBy: { name: 'asc' },
    });

    return fabricantes.map((f) => {
      // O apelido que é a chave do próprio nome não é informação: todo
      // fabricante tem o seu, e listá-lo faria a tela repetir o nome
      // que está ao lado. Interessa o que ele responde **além** dele.
      const proprias = new Set(DicionarioDeFabricante.chavesDe(f.name));

      return {
        id: f.id,
        name: f.name,
        modelCount: f._count.models,
        assetCount: f._count.assets,
        aliases: f.aliases
          .filter((a) => !proprias.has(a.alias))
          .map((a) => ({ id: a.id, alias: a.alias })),
      };
    });
  }

  async criarFabricante(
    usuario: UsuarioAutenticado,
    dto: EscreverFabricanteDto,
  ): Promise<FabricanteView[]> {
    await this.exigirNomeLivre('manufacturer', usuario, dto.name, {});
    await this.exigirChaveLivre(usuario, dto.name);

    try {
      const criado = await this.prisma.manufacturer.create({
        data: { organizationId: usuario.organizationId, name: dto.name },
        select: { id: true },
      });

      await this.dicionario.ensinar(
        usuario.organizationId,
        criado.id,
        DicionarioDeFabricante.chavesDe(dto.name),
      );
    } catch (erro) {
      throw CatalogoDoAtivoService.traduzirDuplicidade(erro, `fabricante "${dto.name}"`);
    }

    return this.fabricantes(usuario);
  }

  async editarFabricante(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EscreverFabricanteDto,
  ): Promise<FabricanteView[]> {
    const atual = await this.prisma.manufacturer.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!atual) throw new NotFoundException('Fabricante não encontrado.');

    await this.exigirNomeLivre('manufacturer', usuario, dto.name, {}, id);
    await this.exigirChaveLivre(usuario, dto.name, id);

    try {
      await this.prisma.manufacturer.update({ where: { id }, data: { name: dto.name } });
    } catch (erro) {
      throw CatalogoDoAtivoService.traduzirDuplicidade(erro, `fabricante "${dto.name}"`);
    }

    // O nome velho **continua** valendo como apelido. Renomear
    // "Hewlett-Packard" para "HP" não faz as máquinas já varridas
    // mudarem o que mandam, e sem isto a próxima varredura recriaria o
    // cadastro que acabou de ser corrigido.
    await this.dicionario.ensinar(usuario.organizationId, id, [
      ...DicionarioDeFabricante.chavesDe(atual.name),
      ...DicionarioDeFabricante.chavesDe(dto.name),
    ]);

    return this.fabricantes(usuario);
  }

  /**
   * Um nome a mais pelo qual este fabricante atende.
   *
   * Existe porque a lista de fabricantes conhecidos não tem como cobrir
   * o fornecedor da esquina, e é o agente de inventário quem descobre a
   * grafia que ninguém previu.
   */
  async apelidar(
    usuario: UsuarioAutenticado,
    id: string,
    texto: string,
  ): Promise<FabricanteView[]> {
    const fabricante = await this.prisma.manufacturer.findFirst({
      where: { id, organizationId: usuario.organizationId },
      select: { id: true, name: true },
    });
    if (!fabricante) throw new NotFoundException('Fabricante não encontrado.');

    const chaves = DicionarioDeFabricante.chavesDe(texto);
    if (chaves.length === 0) {
      throw new BadRequestException('Este apelido não tem letra nem número que o identifique.');
    }

    const dono = await this.dicionario.procurarPorTexto(usuario.organizationId, texto);
    if (dono && dono !== id) {
      const outro = await this.prisma.manufacturer.findUnique({
        where: { id: dono },
        select: { name: true },
      });

      throw new ConflictException(
        `"${texto}" já responde pelo fabricante "${outro?.name}". ` +
          'Se forem o mesmo, junte os dois cadastros em vez de apelidar.',
      );
    }

    await this.dicionario.ensinar(usuario.organizationId, id, chaves);

    await this.auditoria.registrar(usuario, {
      action: 'fabricante.apelidado',
      entity: 'Manufacturer',
      entityId: id,
      depois: { name: fabricante.name, apelidos: chaves },
    });

    return this.fabricantes(usuario);
  }

  async removerApelido(
    usuario: UsuarioAutenticado,
    id: string,
    aliasId: string,
  ): Promise<FabricanteView[]> {
    const apelido = await this.prisma.manufacturerAlias.findFirst({
      where: { id: aliasId, manufacturerId: id, organizationId: usuario.organizationId },
      include: { manufacturer: { select: { name: true } } },
    });
    if (!apelido) throw new NotFoundException('Apelido não encontrado.');

    // A chave do próprio nome não se apaga: sem ela o fabricante deixa
    // de ser encontrável pelo nome dele mesmo, e a próxima varredura
    // cria um segundo cadastro idêntico.
    if (DicionarioDeFabricante.chavesDe(apelido.manufacturer.name).includes(apelido.alias)) {
      throw new ConflictException(
        'Este é o nome do próprio fabricante, não um apelido. Renomeie o fabricante.',
      );
    }

    await this.prisma.manufacturerAlias.delete({ where: { id: aliasId } });

    await this.auditoria.registrar(usuario, {
      action: 'fabricante.apelido-removido',
      entity: 'Manufacturer',
      entityId: id,
      antes: { apelido: apelido.alias },
    });

    return this.fabricantes(usuario);
  }

  /**
   * Junta dois cadastros que são a mesma empresa.
   *
   * É o caminho de saída da sujeira que já está no banco: o dicionário
   * impede a duplicata nova, mas quem já tem "HP" e "Hewlett-Packard"
   * precisa de uma porta. Tudo o que apontava para o absorvido passa a
   * apontar para o que fica, e o **nome dele vira apelido** — senão a
   * próxima varredura da máquina que dizia "Hewlett-Packard" recriaria
   * o cadastro na hora.
   *
   * Uma transação só: metade da junção deixa modelo apontando para um
   * fabricante que não existe mais.
   */
  async juntarFabricantes(
    usuario: UsuarioAutenticado,
    id: string,
    absorvidoId: string,
  ): Promise<FabricanteView[]> {
    if (id === absorvidoId) {
      throw new BadRequestException('Um fabricante não se junta com ele mesmo.');
    }

    const [fica, sai] = await Promise.all([
      this.prisma.manufacturer.findFirst({
        where: { id, organizationId: usuario.organizationId },
        select: { id: true, name: true },
      }),
      this.prisma.manufacturer.findFirst({
        where: { id: absorvidoId, organizationId: usuario.organizationId },
        select: { id: true, name: true, _count: { select: { models: true, assets: true } } },
      }),
    ]);

    if (!fica || !sai) throw new NotFoundException('Fabricante não encontrado.');

    const organizationId = usuario.organizationId;
    const apelidosQueSobem = [
      ...DicionarioDeFabricante.chavesDe(sai.name),
      ...DicionarioDeFabricante.chavesDe(fica.name),
    ];

    await this.prisma.$transaction(async (tx) => {
      // O modelo é o único caso com unicidade composta: "Latitude 5420"
      // dos dois lados viraria duas linhas iguais sob o mesmo
      // fabricante, e o índice recusa. O que colide é apagado, e os
      // ativos dele vão para o modelo que fica.
      const [meus, dele] = await Promise.all([
        tx.assetModel.findMany({ where: { organizationId, manufacturerId: id } }),
        tx.assetModel.findMany({ where: { organizationId, manufacturerId: absorvidoId } }),
      ]);

      const porNome = new Map(meus.map((m) => [m.name.trim().toLocaleLowerCase('pt-BR'), m.id]));

      for (const modelo of dele) {
        const gemeo = porNome.get(modelo.name.trim().toLocaleLowerCase('pt-BR'));

        if (gemeo) {
          await tx.asset.updateMany({
            where: { organizationId, assetModelId: modelo.id },
            data: { assetModelId: gemeo },
          });
          await tx.consumableItemModel.deleteMany({ where: { assetModelId: modelo.id } });
          await tx.assetModel.delete({ where: { id: modelo.id } });
        } else {
          await tx.assetModel.update({ where: { id: modelo.id }, data: { manufacturerId: id } });
        }
      }

      // As outras cinco pontas não têm unicidade por fabricante: é só
      // trocar o dono.
      await tx.asset.updateMany({
        where: { organizationId, manufacturerId: absorvidoId },
        data: { manufacturerId: id },
      });
      await tx.assetComponent.updateMany({
        where: { manufacturerId: absorvidoId },
        data: { manufacturerId: id },
      });
      await tx.software.updateMany({
        where: { organizationId, manufacturerId: absorvidoId },
        data: { manufacturerId: id },
      });
      await tx.consumableItem.updateMany({
        where: { organizationId, manufacturerId: absorvidoId },
        data: { manufacturerId: id },
      });

      // Os apelidos do absorvido passam a ser do que fica, inclusive a
      // chave do nome dele. `ON CONFLICT` não cabe num `updateMany`, e
      // duas linhas com a mesma chave não existem — o índice único
      // garante —, então mover é seguro.
      await tx.manufacturerAlias.updateMany({
        where: { organizationId, manufacturerId: absorvidoId },
        data: { manufacturerId: id },
      });

      await tx.manufacturer.delete({ where: { id: absorvidoId } });

      await tx.manufacturerAlias.createMany({
        data: apelidosQueSobem.map((alias) => ({ organizationId, manufacturerId: id, alias })),
        skipDuplicates: true,
      });
    });

    await this.auditoria.registrar(usuario, {
      action: 'fabricante.juntado',
      entity: 'Manufacturer',
      entityId: id,
      antes: {
        absorvido: sai.name,
        modelos: sai._count.models,
        ativos: sai._count.assets,
      },
      depois: { name: fica.name },
    });

    return this.fabricantes(usuario);
  }

  /**
   * Recusa o cadastro cujo nome já é de outro fabricante.
   *
   * Diferente de `exigirNomeLivre`, que compara texto: aqui a pergunta
   * é se o **dicionário** já responde por este nome. É o que impede
   * cadastrar "Hewlett-Packard" numa casa que já tem HP — e a mensagem
   * diz qual é, porque "já existe" sem dizer onde manda a pessoa
   * procurar na lista inteira.
   */
  private async exigirChaveLivre(
    usuario: UsuarioAutenticado,
    name: string,
    ignorarId?: string,
  ): Promise<void> {
    const dono = await this.dicionario.procurarPorTexto(usuario.organizationId, name);
    if (!dono || dono === ignorarId) return;

    const outro = await this.prisma.manufacturer.findUnique({
      where: { id: dono },
      select: { name: true },
    });

    throw new ConflictException(
      `"${name}" já está cadastrado como "${outro?.name}" nesta organização.`,
    );
  }

  async removerFabricante(usuario: UsuarioAutenticado, id: string): Promise<FabricanteView[]> {
    const fabricante = await this.prisma.manufacturer.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: { _count: { select: { models: true, assets: true } } },
    });
    if (!fabricante) throw new NotFoundException('Fabricante não encontrado.');

    // Modelo sem fabricante é modelo órfão: "OptiPlex 7090" sozinho não
    // diz de quem é. Ativo sem fabricante, sim — o `SET NULL` resolve.
    if (fabricante._count.models > 0) {
      throw new ConflictException(
        'Este fabricante tem modelos. Apague ou mova os modelos antes de apagá-lo.',
      );
    }

    await this.prisma.manufacturer.delete({ where: { id } });

    await this.auditoria.registrar(usuario, {
      action: 'fabricante.removido',
      entity: 'Manufacturer',
      entityId: id,
      antes: { name: fabricante.name, ativos: fabricante._count.assets },
    });

    return this.fabricantes(usuario);
  }

  async modelos(usuario: UsuarioAutenticado): Promise<ModeloDeAtivoView[]> {
    const modelos = await this.prisma.assetModel.findMany({
      where: { organizationId: usuario.organizationId },
      include: {
        manufacturer: { select: { id: true, name: true } },
        _count: { select: { assets: true } },
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });

    return modelos.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      manufacturer: m.manufacturer,
      assetCount: m._count.assets,
    }));
  }

  async criarModelo(
    usuario: UsuarioAutenticado,
    dto: EscreverModeloDeAtivoDto,
  ): Promise<ModeloDeAtivoView[]> {
    if (dto.manufacturerId) {
      const existe = await this.prisma.manufacturer.count({
        where: { id: dto.manufacturerId, organizationId: usuario.organizationId },
      });
      if (!existe) throw new BadRequestException('Fabricante não encontrado nesta organização.');
    }

    await this.exigirNomeLivre('assetModel', usuario, dto.name, {
      manufacturerId: dto.manufacturerId ?? null,
    });

    try {
      await this.prisma.assetModel.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          kind: dto.kind ?? 'OUTRO',
          manufacturerId: dto.manufacturerId ?? null,
        },
      });
    } catch (erro) {
      throw CatalogoDoAtivoService.traduzirDuplicidade(erro, `modelo "${dto.name}"`);
    }

    return this.modelos(usuario);
  }

  async editarModelo(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EscreverModeloDeAtivoDto,
  ): Promise<ModeloDeAtivoView[]> {
    const atual = await this.prisma.assetModel.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!atual) throw new NotFoundException('Modelo não encontrado.');

    if (dto.manufacturerId) {
      const existe = await this.prisma.manufacturer.count({
        where: { id: dto.manufacturerId, organizationId: usuario.organizationId },
      });
      if (!existe) throw new BadRequestException('Fabricante não encontrado nesta organização.');
    }

    await this.exigirNomeLivre(
      'assetModel',
      usuario,
      dto.name,
      {
        manufacturerId:
          dto.manufacturerId === undefined ? atual.manufacturerId : (dto.manufacturerId ?? null),
      },
      id,
    );

    try {
      await this.prisma.assetModel.update({
        where: { id },
        data: {
          name: dto.name,
          ...(dto.kind === undefined ? {} : { kind: dto.kind }),
          ...(dto.manufacturerId === undefined ? {} : { manufacturerId: dto.manufacturerId }),
        },
      });
    } catch (erro) {
      throw CatalogoDoAtivoService.traduzirDuplicidade(erro, `modelo "${dto.name}"`);
    }

    return this.modelos(usuario);
  }

  async removerModelo(usuario: UsuarioAutenticado, id: string): Promise<ModeloDeAtivoView[]> {
    const modelo = await this.prisma.assetModel.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: { _count: { select: { assets: true } } },
    });
    if (!modelo) throw new NotFoundException('Modelo não encontrado.');

    await this.prisma.assetModel.delete({ where: { id } });

    await this.auditoria.registrar(usuario, {
      action: 'modelo.removido',
      entity: 'AssetModel',
      entityId: id,
      antes: { name: modelo.name, ativos: modelo._count.assets },
    });

    return this.modelos(usuario);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /**
   * Recusa nome repetido entre irmãos, sem olhar maiúscula.
   *
   * O `@@unique` do banco não cobre dois casos que a tela produz sem
   * esforço: `parentId` nulo — para o Postgres dois `NULL` são
   * distintos, e "Matriz" e "Matriz" convivem no nível mais alto — e a
   * diferença de caixa, que é a origem do problema que este catálogo
   * existe para resolver ("HP", "hp", "Hewlett-Packard"). O índice
   * continua sendo a rede contra duas requisições simultâneas com o
   * nome idêntico; isto aqui é o que a pessoa vê.
   *
   * A comparação é em JavaScript, não no `mode: 'insensitive'` do
   * Prisma: aquilo vira `ILIKE`, que dobra a caixa pela *collation* do
   * banco — e na nossa "RECEPÇÃO" e "Recepção" passavam como nomes
   * diferentes. `toLocaleLowerCase('pt-BR')` dobra o Ç e o Ã. Acento
   * continua contando: "Sao" e "São" são nomes distintos.
   */
  private async exigirNomeLivre(
    onde: 'location' | 'manufacturer' | 'assetModel',
    usuario: UsuarioAutenticado,
    name: string,
    escopo: { parentId?: string | null; manufacturerId?: string | null },
    ignorarId?: string,
  ): Promise<void> {
    const where = {
      organizationId: usuario.organizationId,
      ...(escopo.parentId === undefined ? {} : { parentId: escopo.parentId }),
      ...(escopo.manufacturerId === undefined ? {} : { manufacturerId: escopo.manufacturerId }),
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    };
    const select = { name: true };

    const irmaos =
      onde === 'location'
        ? await this.prisma.location.findMany({ where, select })
        : onde === 'manufacturer'
          ? await this.prisma.manufacturer.findMany({ where, select })
          : await this.prisma.assetModel.findMany({ where, select });

    const alvo = dobrar(name);
    if (!irmaos.some((i) => dobrar(i.name) === alvo)) return;

    // "Aqui" só faz sentido para a localização, que repete dentro do
    // mesmo pai. Fabricante e modelo são da organização inteira.
    const jaExiste =
      onde === 'location'
        ? `Já existe a localização "${name}" neste mesmo lugar.`
        : onde === 'manufacturer'
          ? `Já existe o fabricante "${name}" nesta organização.`
          : `Já existe o modelo "${name}" para este fabricante.`;
    throw new ConflictException(jaExiste);
  }

  private static caminhos(
    locais: { id: string; name: string; parentId: string | null }[],
  ): Map<string, string> {
    const porId = new Map(locais.map((l) => [l.id, l]));
    const prontos = new Map<string, string>();

    const montar = (id: string, visitados = new Set<string>()): string => {
      const pronto = prontos.get(id);
      if (pronto) return pronto;

      const local = porId.get(id);
      if (!local) return '';
      if (visitados.has(id)) return local.name;
      visitados.add(id);

      const caminho = local.parentId
        ? `${montar(local.parentId, visitados)} > ${local.name}`
        : local.name;

      prontos.set(id, caminho);
      return caminho;
    };

    for (const local of locais) montar(local.id);
    return prontos;
  }

  private async exigirPai(
    usuario: UsuarioAutenticado,
    parentId: string | null | undefined,
  ): Promise<void> {
    if (!parentId) return;

    const existe = await this.prisma.location.count({
      where: { id: parentId, organizationId: usuario.organizationId },
    });
    if (!existe) throw new BadRequestException('Localização acima não encontrada.');
  }

  /**
   * Pendurar uma localização debaixo da própria descendência criaria um
   * ciclo — e a árvore some da tela sem erro nenhum, porque a raiz
   * deixa de existir.
   */
  private async exigirSemCiclo(
    usuario: UsuarioAutenticado,
    id: string,
    novoPaiId: string | null | undefined,
  ): Promise<void> {
    let cursor = novoPaiId ?? null;

    for (let i = 0; i < MAX_NIVEIS && cursor; i += 1) {
      if (cursor === id) {
        throw new BadRequestException(
          'Uma localização não pode ficar dentro de si mesma nem da própria descendência.',
        );
      }

      const pai: { parentId: string | null } | null = await this.prisma.location.findFirst({
        where: { id: cursor, organizationId: usuario.organizationId },
        select: { parentId: true },
      });

      cursor = pai?.parentId ?? null;
    }
  }

  private static traduzirDuplicidade(erro: unknown, oQue: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(`Já existe ${oQue} nesta organização.`);
    }
    return erro;
  }
}
