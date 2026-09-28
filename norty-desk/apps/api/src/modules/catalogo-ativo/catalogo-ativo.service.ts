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
  ReclassificacaoView,
  RegraDeSistemaView,
  SistemasDoParqueView,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DicionarioDeFabricante } from './fabricantes.dicionario';
import { DicionarioDeModelo } from './modelos.dicionario';
import { DicionarioDeSistemaOperacional } from './sistemas.dicionario';
import type {
  EscreverFabricanteDto,
  EscreverLocalizacaoDto,
  EscreverModeloDeAtivoDto,
  EscreverRegraDeSistemaDto,
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
    private readonly dicionarioDeModelo: DicionarioDeModelo,
    private readonly sistemas: DicionarioDeSistemaOperacional,
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
        aliases: { orderBy: { alias: 'asc' }, select: { id: true, alias: true } },
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });

    return modelos.map((m) => {
      // A chave do próprio nome não é informação — todo modelo tem a
      // sua. Interessa o que ele responde **além** dela.
      const proprias = new Set(DicionarioDeModelo.chavesDe(m.name, m.manufacturer?.name));

      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        manufacturer: m.manufacturer,
        assetCount: m._count.assets,
        aliases: m.aliases
          .filter((a) => !proprias.has(a.alias))
          .map((a) => ({ id: a.id, alias: a.alias })),
      };
    });
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

    const fabricante = await this.nomeDoFabricante(usuario, dto.manufacturerId ?? null);
    await this.exigirChaveDeModeloLivre(usuario, dto.name, fabricante);

    try {
      const criado = await this.prisma.assetModel.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          kind: dto.kind ?? 'OUTRO',
          manufacturerId: dto.manufacturerId ?? null,
        },
        select: { id: true },
      });

      await this.dicionarioDeModelo.ensinar(
        usuario.organizationId,
        criado.id,
        DicionarioDeModelo.chavesDe(dto.name, fabricante),
      );
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

    const antes = await this.nomeDoFabricante(usuario, atual.manufacturerId);
    const depois = await this.nomeDoFabricante(
      usuario,
      dto.manufacturerId === undefined ? atual.manufacturerId : (dto.manufacturerId ?? null),
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

    // O nome velho **continua** valendo como apelido, igual ao
    // fabricante: corrigir "20XW00AABR" para "ThinkPad T14 Gen 2" não faz
    // a máquina mandar outra coisa, e sem isto a próxima varredura
    // recriaria o cadastro que acabou de ser corrigido.
    await this.dicionarioDeModelo.ensinar(usuario.organizationId, id, [
      ...DicionarioDeModelo.chavesDe(atual.name, antes),
      ...DicionarioDeModelo.chavesDe(dto.name, depois),
    ]);

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

  /**
   * Um nome a mais pelo qual este modelo atende.
   *
   * O caso que justifica a tela: a Lenovo manda "20XW00AABR" e ninguém
   * consegue adivinhar que é um ThinkPad T14 Gen 2. Quem sabe ensina uma
   * vez, e a próxima varredura cai no cadastro certo.
   */
  async apelidarModelo(
    usuario: UsuarioAutenticado,
    id: string,
    texto: string,
  ): Promise<ModeloDeAtivoView[]> {
    const modelo = await this.prisma.assetModel.findFirst({
      where: { id, organizationId: usuario.organizationId },
      select: { id: true, name: true, manufacturer: { select: { name: true } } },
    });
    if (!modelo) throw new NotFoundException('Modelo não encontrado.');

    const chaves = DicionarioDeModelo.chavesDe(texto, modelo.manufacturer?.name);
    if (chaves.length === 0) {
      throw new BadRequestException('Este apelido não tem letra nem número que o identifique.');
    }

    const dono = await this.dicionarioDeModelo.procurarPorTexto(
      usuario.organizationId,
      texto,
      modelo.manufacturer?.name,
    );

    if (dono && dono !== id) {
      const outro = await this.prisma.assetModel.findUnique({
        where: { id: dono },
        select: { name: true },
      });

      throw new ConflictException(
        `"${texto}" já responde pelo modelo "${outro?.name}". ` +
          'Se forem o mesmo, junte os dois cadastros em vez de apelidar.',
      );
    }

    await this.dicionarioDeModelo.ensinar(usuario.organizationId, id, chaves);

    await this.auditoria.registrar(usuario, {
      action: 'modelo.apelidado',
      entity: 'AssetModel',
      entityId: id,
      depois: { name: modelo.name, apelidos: chaves },
    });

    return this.modelos(usuario);
  }

  async removerApelidoDeModelo(
    usuario: UsuarioAutenticado,
    id: string,
    aliasId: string,
  ): Promise<ModeloDeAtivoView[]> {
    const apelido = await this.prisma.assetModelAlias.findFirst({
      where: { id: aliasId, assetModelId: id, organizationId: usuario.organizationId },
      include: { assetModel: { select: { name: true, manufacturer: { select: { name: true } } } } },
    });
    if (!apelido) throw new NotFoundException('Apelido não encontrado.');

    if (
      DicionarioDeModelo.chavesDe(
        apelido.assetModel.name,
        apelido.assetModel.manufacturer?.name,
      ).includes(apelido.alias)
    ) {
      throw new BadRequestException(
        'Este é o nome do próprio modelo, não um apelido. Renomeie o modelo.',
      );
    }

    await this.prisma.assetModelAlias.delete({ where: { id: aliasId } });

    await this.auditoria.registrar(usuario, {
      action: 'modelo.apelido-removido',
      entity: 'AssetModel',
      entityId: id,
      antes: { apelido: apelido.alias },
    });

    return this.modelos(usuario);
  }

  /**
   * Junta dois cadastros que são o mesmo equipamento.
   *
   * A saída para a sujeira que já está no banco — e aqui ela é mais
   * comum que no fabricante, porque o nome do modelo tem mais formas de
   * ser escrito: "20XW00AABR", "ThinkPad T14 Gen 2" e "Thinkpad T14"
   * podem ser três linhas com máquinas em cada uma.
   *
   * Tudo o que aponta para o absorvido passa ao que fica, e o **nome
   * dele vira apelido** — senão a próxima varredura o recria.
   */
  async juntarModelos(
    usuario: UsuarioAutenticado,
    id: string,
    absorvidoId: string,
  ): Promise<ModeloDeAtivoView[]> {
    if (id === absorvidoId) {
      throw new BadRequestException('Um modelo não se junta com ele mesmo.');
    }

    const onde = { organizationId: usuario.organizationId };
    const selecao = {
      id: true,
      name: true,
      manufacturer: { select: { name: true } },
      _count: { select: { assets: true } },
    };

    const [fica, sai] = await Promise.all([
      this.prisma.assetModel.findFirst({ where: { id, ...onde }, select: selecao }),
      this.prisma.assetModel.findFirst({ where: { id: absorvidoId, ...onde }, select: selecao }),
    ]);

    if (!fica || !sai) throw new NotFoundException('Modelo não encontrado.');

    const organizationId = usuario.organizationId;
    const apelidosQueSobem = [
      ...DicionarioDeModelo.chavesDe(sai.name, sai.manufacturer?.name),
      ...DicionarioDeModelo.chavesDe(fica.name, fica.manufacturer?.name),
    ];

    // Uma transação só: metade da junção deixa equipamento apontando
    // para um modelo que não existe mais.
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.updateMany({
        where: { organizationId, assetModelId: absorvidoId },
        data: { assetModelId: id },
      });

      // A compatibilidade de consumível tem chave composta
      // `(assetModelId, itemId)`: o mesmo cartucho declarado nos dois
      // lados viraria duas linhas iguais, e a chave recusa. O que já
      // existe no modelo que fica prevalece; o do absorvido é apagado.
      const [meus, dele] = await Promise.all([
        tx.consumableItemModel.findMany({ where: { assetModelId: id } }),
        tx.consumableItemModel.findMany({ where: { assetModelId: absorvidoId } }),
      ]);

      const jaTenho = new Set(meus.map((c) => c.itemId));

      for (const compat of dele) {
        const chave = { itemId: compat.itemId, assetModelId: absorvidoId };

        if (jaTenho.has(compat.itemId)) {
          await tx.consumableItemModel.delete({ where: { itemId_assetModelId: chave } });
        } else {
          await tx.consumableItemModel.update({
            where: { itemId_assetModelId: chave },
            data: { assetModelId: id },
          });
        }
      }

      await tx.assetModelAlias.updateMany({
        where: { organizationId, assetModelId: absorvidoId },
        data: { assetModelId: id },
      });

      await tx.assetModel.delete({ where: { id: absorvidoId } });

      await tx.assetModelAlias.createMany({
        data: apelidosQueSobem.map((alias) => ({ organizationId, assetModelId: id, alias })),
        skipDuplicates: true,
      });
    });

    await this.auditoria.registrar(usuario, {
      action: 'modelo.juntado',
      entity: 'AssetModel',
      entityId: id,
      antes: { absorvido: sai.name, ativos: sai._count.assets },
      depois: { name: fica.name },
    });

    return this.modelos(usuario);
  }

  // -------------------------------------------------------------------
  // Dicionário de sistema operacional
  // -------------------------------------------------------------------

  /**
   * O que o parque tem hoje, do ponto de vista do sistema operacional.
   *
   * Duas listas, porque a tela faz duas perguntas. `porProduto` é o
   * relatório — "quantas máquinas ainda estão no Windows 10?". `captions`
   * é o material de trabalho: **não dá para ensinar o que ninguém sabe
   * que existe**, e o caption estranho é exatamente o que desaparece de
   * qualquer agrupamento.
   *
   * O que aparece em cada caption é o que está **gravado**, não o que a
   * função diria agora: é o valor que os relatórios estão usando, e é
   * sobre ele que a decisão de ensinar se toma. Um mesmo caption pode
   * aparecer em duas linhas — a correção por build separa a máquina que
   * subiu para o 11 daquela que ficou no 10 —, e isso é informação.
   */
  async sistemasDoParque(usuario: UsuarioAutenticado): Promise<SistemasDoParqueView> {
    const organizationId = usuario.organizationId;

    const [porProduto, porCaption, regras] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['osProduct', 'osEdition'],
        where: { organizationId, osName: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.asset.groupBy({
        by: ['osName', 'osProduct', 'osEdition'],
        where: { organizationId, osName: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.operatingSystemAlias.findMany({
        where: { organizationId },
        select: { alias: true },
      }),
    ]);

    const ensinados = new Set(regras.map((r) => r.alias));

    return {
      porProduto: porProduto
        .map((p) => ({
          product: p.osProduct,
          edition: p.osEdition,
          assetCount: p._count._all,
        }))
        .sort((a, b) => b.assetCount - a.assetCount),

      captions: porCaption
        .map((c) => {
          const alias = DicionarioDeSistemaOperacional.chaveDe(c.osName ?? '');

          return {
            osName: c.osName ?? '',
            assetCount: c._count._all,
            alias,
            product: c.osProduct,
            edition: c.osEdition,
            ensinado: ensinados.has(alias),
          };
        })
        .sort((a, b) => b.assetCount - a.assetCount),
    };
  }

  async regrasDeSistema(usuario: UsuarioAutenticado): Promise<RegraDeSistemaView[]> {
    const organizationId = usuario.organizationId;

    const [regras, porCaption] = await Promise.all([
      this.prisma.operatingSystemAlias.findMany({
        where: { organizationId },
        orderBy: { alias: 'asc' },
      }),
      this.prisma.asset.groupBy({
        by: ['osName'],
        where: { organizationId, osName: { not: null } },
        _count: { _all: true },
      }),
    ]);

    // Quantas máquinas cada regra está classificando. Duas grafias do
    // mesmo caption caem na mesma chave, então a contagem soma por chave
    // e não por texto.
    const porChave = new Map<string, number>();

    for (const c of porCaption) {
      const chave = DicionarioDeSistemaOperacional.chaveDe(c.osName ?? '');
      porChave.set(chave, (porChave.get(chave) ?? 0) + c._count._all);
    }

    return regras.map((r) => ({
      id: r.id,
      alias: r.alias,
      product: r.product,
      edition: r.edition,
      assetCount: porChave.get(r.alias) ?? 0,
    }));
  }

  /**
   * Ensina — ou corrige — a regra de um caption.
   *
   * Reclassifica o parque na mesma chamada. Ensinar e não reclassificar
   * seria ensinar para nada: as máquinas já varridas continuariam com a
   * classificação antiga, e a próxima varredura pode demorar dias — ou
   * nunca vir, se a máquina saiu de operação. Quem ensina espera ver o
   * número mudar.
   */
  async escreverRegraDeSistema(
    usuario: UsuarioAutenticado,
    dto: EscreverRegraDeSistemaDto,
  ): Promise<RegraDeSistemaView[]> {
    const alias = DicionarioDeSistemaOperacional.chaveDe(dto.caption);

    if (!alias || !/[a-z0-9]/.test(alias)) {
      throw new BadRequestException('Este texto não tem letra nem número que o identifique.');
    }

    const product = dto.product.trim().replace(/\s+/g, ' ');
    const edition = dto.edition?.trim().replace(/\s+/g, ' ') || null;

    const antes = await this.prisma.operatingSystemAlias.findUnique({
      where: { organizationId_alias: { organizationId: usuario.organizationId, alias } },
      select: { product: true, edition: true },
    });

    await this.prisma.operatingSystemAlias.upsert({
      where: { organizationId_alias: { organizationId: usuario.organizationId, alias } },
      create: { organizationId: usuario.organizationId, alias, product, edition },
      update: { product, edition },
    });

    await this.sistemas.reclassificar(usuario.organizationId);

    await this.auditoria.registrar(usuario, {
      action: antes ? 'so.regra-corrigida' : 'so.regra-criada',
      entity: 'OperatingSystemAlias',
      entityId: alias,
      ...(antes ? { antes } : {}),
      depois: { alias, product, edition },
    });

    return this.regrasDeSistema(usuario);
  }

  /**
   * Apaga a regra e reclassifica.
   *
   * Sem reclassificar, o parque ficaria com o resultado de uma regra que
   * não existe mais — que é pior que estar errado, porque não há onde
   * olhar para descobrir de onde veio.
   */
  async removerRegraDeSistema(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<RegraDeSistemaView[]> {
    const regra = await this.prisma.operatingSystemAlias.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!regra) throw new NotFoundException('Regra não encontrada.');

    await this.prisma.operatingSystemAlias.delete({ where: { id } });
    await this.sistemas.reclassificar(usuario.organizationId);

    await this.auditoria.registrar(usuario, {
      action: 'so.regra-removida',
      entity: 'OperatingSystemAlias',
      entityId: regra.alias,
      antes: { alias: regra.alias, product: regra.product, edition: regra.edition },
    });

    return this.regrasDeSistema(usuario);
  }

  /**
   * Reaplica o dicionário sobre o parque, sem mexer em regra nenhuma.
   *
   * É a porta para o caso em que a classificação mudou sem ninguém
   * ensinar nada: as colunas nasceram nulas na migração, e uma versão
   * nova da aplicação pode melhorar a função pura. Botão explícito, e
   * não um cron: rodar sozinho escondereria a mudança de número de quem
   * precisa explicá-la.
   */
  async reclassificarSistemas(usuario: UsuarioAutenticado): Promise<ReclassificacaoView> {
    const resultado = await this.sistemas.reclassificar(usuario.organizationId);

    await this.auditoria.registrar(usuario, {
      action: 'so.reclassificado',
      entity: 'Organization',
      entityId: usuario.organizationId,
      depois: resultado,
    });

    return resultado;
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /**
   * O nome do fabricante deste id, que é o que a chave do modelo precisa.
   *
   * A chave é calculada em `packages/shared` a partir do nome — ver
   * `chaveDeModelo`, que tira o fabricante colado na frente. Só o id não
   * serve.
   */
  private async nomeDoFabricante(
    usuario: UsuarioAutenticado,
    manufacturerId: string | null,
  ): Promise<string | null> {
    if (!manufacturerId) return null;

    const fabricante = await this.prisma.manufacturer.findFirst({
      where: { id: manufacturerId, organizationId: usuario.organizationId },
      select: { name: true },
    });

    return fabricante?.name ?? null;
  }

  /**
   * Recusa o modelo cujo nome o dicionário já resolve para outro.
   *
   * Diferente de `exigirNomeLivre`, que compara texto sob o mesmo
   * fabricante: aqui a pergunta é se cadastrar "EliteBook 840 G8 Notebook
   * PC" vai cair no "EliteBook 840 G8" que já existe. Cai — e deixar
   * criar os dois é criar a duplicata que o dicionário existe para
   * impedir.
   */
  private async exigirChaveDeModeloLivre(
    usuario: UsuarioAutenticado,
    nome: string,
    fabricante: string | null,
    ignorarId?: string,
  ): Promise<void> {
    const dono = await this.dicionarioDeModelo.procurarPorTexto(
      usuario.organizationId,
      nome,
      fabricante,
    );

    if (!dono || dono === ignorarId) return;

    const outro = await this.prisma.assetModel.findUnique({
      where: { id: dono },
      select: { name: true },
    });

    throw new ConflictException(
      `"${nome}" é o mesmo modelo que "${outro?.name}", que já está cadastrado.`,
    );
  }

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
