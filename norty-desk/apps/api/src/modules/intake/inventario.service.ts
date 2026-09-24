import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import type { ComponentKind, InventarioResponse } from '@norty-desk/shared';
import { serieUtil, validarAtributos } from '@norty-desk/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { InventarioDto } from './inventario.dto';

/**
 * Os tipos que o agente administra.
 *
 * Só estes são apagados quando somem da varredura. Uma fonte ou um
 * gabinete que alguém cadastrou à mão continua ali: o agente não os
 * enxerga, e "não enxerguei" não é "não existe".
 */
const DO_AGENTE: readonly ComponentKind[] = ['PROCESSADOR', 'MEMORIA', 'DISCO'];

/** Uma peça pronta para gravar, com a chave pela qual ela é reconhecida. */
type PecaDesejada = {
  chave: string;
  kind: ComponentKind;
  name: string;
  serialNumber: string | null;
  attributes: Prisma.InputJsonValue;
};

/**
 * A máquina se cadastra sozinha.
 *
 * ## Quem decide o quê
 *
 * O agente lê o hardware e manda; **toda** decisão é daqui. Ele não
 * sabe se a máquina já existe, não escolhe a empresa, não apaga nada.
 * A razão é simples: código que roda em duzentas máquinas de cliente
 * não é código que se corrige numa tarde, e a regra que muda é a que
 * tem de ficar do lado que se testa.
 *
 * ## A empresa vem da chave, nunca do corpo
 *
 * É a mesma regra do intake de chamados: quem tem o token diz por si.
 * Um `clientId` no corpo deixaria uma chave cadastrar equipamento na
 * carteira de outro cliente.
 *
 * ## O que o agente escreve, e o que ele nunca toca
 *
 * Escreve o que é da máquina: `hostname`, sistema operacional,
 * `lastSeenAt`, versão do agente, e as peças dos três tipos que ele
 * enxerga.
 *
 * Nunca toca no que alguém digitou: nome, patrimônio, situação, local,
 * observações, empresa, quem está com o equipamento, em que máquina o
 * periférico pendura. O agente **preenche o que está em branco** —
 * série, fabricante, modelo — e não sobrescreve o que já tem valor:
 * quem apontou o ativo para o fabricante "HP" do catálogo não pode
 * vê-lo virar "Hewlett-Packard" na varredura da madrugada, que é
 * exatamente a sujeira que o catálogo existe para evitar.
 */
@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(private readonly prisma: PrismaService) {}

  async receber(
    aplicacao: { organizationId: string; clientId: string | null },
    dto: InventarioDto,
  ): Promise<InventarioResponse> {
    const { organizationId, clientId } = aplicacao;
    const uuid = dto.uuid.trim().toLowerCase();
    const serie = serieUtil(dto.serialNumber);

    const achado = await this.encontrar(organizationId, uuid, serie);

    // Igualdade exata, e **não** `deClientesDiferentes`.
    //
    // A regra de "da casa combina com todo mundo" vale para quem segura
    // equipamento: o técnico da casa leva a máquina do cliente para o
    // conserto. Aqui é outra coisa — é uma credencial dizendo em que
    // parque pode escrever, e nela o coringa abre nos dois sentidos:
    // a chave de um cliente passaria a escrever no equipamento da casa.
    //
    // Cada chave escreve no parque que ela representa. Quando a
    // varredura bate numa máquina de outro parque, o que houve foi
    // agente instalado com a chave errada — e mudar a empresa do
    // equipamento por causa disso moveria o parque de um cliente para o
    // outro sem ninguém decidir.
    if (achado.ativo && achado.ativo.clientId !== clientId) {
      throw new ConflictException(
        'Esta máquina já está cadastrada em outra empresa. ' +
          'Confira a chave usada pelo agente antes de varrer de novo.',
      );
    }

    const agora = new Date();
    const daMaquina = {
      deviceUuid: uuid,
      hostname: dto.hostname.trim(),
      osName: dto.os?.name?.trim() || null,
      osVersion: dto.os?.version?.trim() || null,
      agentVersion: dto.agente?.versao?.trim() || null,
      lastSeenAt: agora,
    };

    const [manufacturerId, assetModelId] = await Promise.all([
      this.doCatalogo('manufacturer', organizationId, dto.manufacturer),
      this.doCatalogo('assetModel', organizationId, dto.model),
    ]);

    let assetId: string;

    if (achado.ativo) {
      const ativo = achado.ativo;

      await this.prisma.asset.update({
        where: { id: ativo.id },
        data: {
          ...daMaquina,
          // Só o que está em branco. Ver o cabeçalho.
          ...(ativo.serialNumber === null && serie ? { serialNumber: serie } : {}),
          ...(ativo.manufacturerId === null && manufacturerId ? { manufacturerId } : {}),
          ...(ativo.assetModelId === null && assetModelId ? { assetModelId } : {}),
        },
      });

      assetId = ativo.id;
    } else {
      const criado = await this.prisma.asset.create({
        data: {
          organizationId,
          clientId,
          ...daMaquina,
          // O nome sai do hostname **uma vez**. Depois ele é da casa.
          name: dto.hostname.trim(),
          kind: dto.kind ?? 'COMPUTADOR',
          status: 'EM_USO',
          serialNumber: serie,
          manufacturerId,
          assetModelId,
        },
        select: { id: true },
      });

      assetId = criado.id;
    }

    const componentes = await this.reconciliarPecas(organizationId, assetId, dto);

    this.logger.log(
      `Inventário de ${dto.hostname}: ${achado.por === 'NOVO' ? 'cadastrada' : 'atualizada'} ` +
        `(${achado.por}), ${componentes.criados} peça(s) nova(s), ` +
        `${componentes.removidos} removida(s).`,
    );

    return { assetId, criado: achado.por === 'NOVO', reconhecidoPor: achado.por, componentes };
  }

  // -------------------------------------------------------------------
  // Reconhecer a máquina
  // -------------------------------------------------------------------

  /**
   * O UUID primeiro, a série depois.
   *
   * A ordem importa: a série é o campo que a montadora de máquina
   * branca preenche com texto de catálogo, e `serieUtil` já descartou
   * os conhecidos — mas o UUID do SMBIOS é único de verdade, e é ele
   * que sobrevive à troca do disco e à reinstalação do sistema.
   *
   * Casar pela série existe para a máquina que **já estava cadastrada à
   * mão** antes de o agente chegar: sem isso, a primeira varredura
   * criaria uma segunda linha para o notebook que o técnico já tinha
   * digitado, com patrimônio, local e dono na linha errada.
   */
  private async encontrar(
    organizationId: string,
    uuid: string,
    serie: string | null,
  ): Promise<{
    ativo: {
      id: string;
      clientId: string | null;
      serialNumber: string | null;
      manufacturerId: string | null;
      assetModelId: string | null;
    } | null;
    por: 'UUID' | 'SERIE' | 'NOVO';
  }> {
    const select = {
      id: true,
      clientId: true,
      serialNumber: true,
      manufacturerId: true,
      assetModelId: true,
    };

    const porUuid = await this.prisma.asset.findFirst({
      where: { organizationId, deviceUuid: uuid },
      select,
    });
    if (porUuid) return { ativo: porUuid, por: 'UUID' };

    if (serie) {
      const porSerie = await this.prisma.asset.findFirst({
        where: { organizationId, serialNumber: serie },
        select,
      });
      if (porSerie) return { ativo: porSerie, por: 'SERIE' };
    }

    return { ativo: null, por: 'NOVO' };
  }

  // -------------------------------------------------------------------
  // As peças
  // -------------------------------------------------------------------

  private async reconciliarPecas(
    organizationId: string,
    assetId: string,
    dto: InventarioDto,
  ): Promise<{ criados: number; atualizados: number; removidos: number }> {
    const desejadas = InventarioService.pecasDaVarredura(dto);

    // A ficha do componente é a mesma do cadastro à mão, e é validada
    // pela mesma função. Guardar um valor fora da lista deixaria a peça
    // no banco e a tela do equipamento sem conseguir desenhá-la — falha
    // muda, descoberta meses depois por quem abre o ativo. Falhar alto
    // aqui é agente desatualizado, e isso se corrige.
    for (const peca of desejadas) {
      const erros = validarAtributos(peca.kind, peca.attributes as Record<string, unknown>);
      if (erros.length > 0) {
        throw new BadRequestException(
          `A peça "${peca.name}" veio com ficha inválida: ` +
            erros.map((e) => `${e.key} — ${e.mensagem}`).join('; '),
        );
      }
    }

    const existentes = await this.prisma.assetComponent.findMany({
      where: { assetId, organizationId, kind: { in: [...DO_AGENTE] } },
      select: { id: true, kind: true, name: true, serialNumber: true, attributes: true },
    });

    const porChave = new Map(existentes.map((c) => [InventarioService.chaveDaPeca(c), c]));
    const usadas = new Set<string>();

    let criados = 0;
    let atualizados = 0;

    for (const peca of desejadas) {
      const existente = porChave.get(peca.chave);

      if (existente) {
        usadas.add(peca.chave);
        await this.prisma.assetComponent.update({
          where: { id: existente.id },
          data: { name: peca.name, attributes: peca.attributes },
        });
        atualizados += 1;
        continue;
      }

      criados += (await this.gravarPeca(organizationId, assetId, peca)) ? 1 : 0;
    }

    // O que sumiu da varredura sai — mas só dos tipos que o agente
    // enxerga. Pente retirado da máquina tem de sumir do inventário;
    // senão a soma de memória da frota cresce sozinha.
    const removidos = existentes.filter((c) => !usadas.has(InventarioService.chaveDaPeca(c)));

    if (removidos.length > 0) {
      await this.prisma.assetComponent.deleteMany({
        where: { id: { in: removidos.map((c) => c.id) } },
      });
    }

    return { criados, atualizados, removidos: removidos.length };
  }

  /**
   * Grava a peça — ou a traz de outra máquina, se ela já existe.
   *
   * Série de peça é única na organização, e o disco que saiu de uma
   * máquina e entrou noutra continua com a mesma. Criar cairia no
   * índice único; **mudar de dono é o que de fato aconteceu**, e é o
   * que responde "para onde foi aquele SSD?".
   */
  private async gravarPeca(
    organizationId: string,
    assetId: string,
    peca: PecaDesejada,
  ): Promise<boolean> {
    if (peca.serialNumber) {
      const noutraMaquina = await this.prisma.assetComponent.findFirst({
        where: { organizationId, serialNumber: peca.serialNumber },
        select: { id: true },
      });

      if (noutraMaquina) {
        await this.prisma.assetComponent.update({
          where: { id: noutraMaquina.id },
          data: { assetId, kind: peca.kind, name: peca.name, attributes: peca.attributes },
        });
        return false;
      }
    }

    await this.prisma.assetComponent.create({
      data: {
        organizationId,
        assetId,
        kind: peca.kind,
        name: peca.name,
        serialNumber: peca.serialNumber,
        attributes: peca.attributes,
      },
    });

    return true;
  }

  /**
   * Como a peça é reconhecida entre uma varredura e outra.
   *
   * Pela série quando ela existe e presta. Sem série, pelo tipo mais o
   * nome mais o slot: dois pentes iguais em slots diferentes são duas
   * peças, e sem o slot no meio a segunda varredura acharia que uma
   * delas sumiu e a outra nasceu.
   */
  private static chaveDaPeca(peca: {
    kind: ComponentKind;
    name: string;
    serialNumber: string | null;
    attributes: unknown;
  }): string {
    const serie = serieUtil(peca.serialNumber);
    if (serie) return `serie:${serie}`;

    const slot = (peca.attributes as { slot?: unknown } | null)?.slot;
    return `${peca.kind}|${peca.name.trim().toLowerCase()}|${typeof slot === 'string' ? slot : ''}`;
  }

  private static pecasDaVarredura(dto: InventarioDto): PecaDesejada[] {
    const pecas: PecaDesejada[] = [];

    for (const p of dto.processadores ?? []) {
      pecas.push(
        InventarioService.peca('PROCESSADOR', p.name, null, {
          ...semNulos({
            nucleos: p.nucleos,
            threads: p.threads,
            frequencia: p.frequencia,
            arquitetura: p.arquitetura,
          }),
        }),
      );
    }

    for (const m of dto.memorias ?? []) {
      pecas.push(
        InventarioService.peca('MEMORIA', m.name, m.serialNumber, {
          capacidade: m.capacidade,
          ...semNulos({ tecnologia: m.tecnologia, frequencia: m.frequencia, slot: m.slot }),
        }),
      );
    }

    for (const d of dto.discos ?? []) {
      pecas.push(
        InventarioService.peca('DISCO', d.name, d.serialNumber, {
          capacidade: d.capacidade,
          ...semNulos({ tecnologia: d.tecnologia, interface: d.interface }),
        }),
      );
    }

    // Duas peças com a mesma chave na **mesma** varredura seriam a
    // mesma linha escrita duas vezes: a segunda apagaria a primeira do
    // conjunto de usadas e ela seria removida logo em seguida.
    const vistas = new Set<string>();
    return pecas.filter((p) => !vistas.has(p.chave) && vistas.add(p.chave));
  }

  private static peca(
    kind: ComponentKind,
    name: string,
    serialNumber: string | null | undefined,
    attributes: Record<string, unknown>,
  ): PecaDesejada {
    const peca = {
      kind,
      name: name.trim(),
      serialNumber: serieUtil(serialNumber),
      attributes: attributes as Prisma.InputJsonValue,
    };

    return { ...peca, chave: InventarioService.chaveDaPeca({ ...peca, attributes }) };
  }

  // -------------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------------

  /**
   * O fabricante ou o modelo, do catálogo.
   *
   * Procura **sem diferenciar caixa** antes de criar: "HP", "hp" e "Hp"
   * são três linhas para quem conta e um só fabricante para quem olha,
   * e é essa multiplicação que o catálogo existe para impedir. O agente
   * é justamente quem a produziria mais rápido, uma por máquina.
   */
  private async doCatalogo(
    tabela: 'manufacturer' | 'assetModel',
    organizationId: string,
    nome: string | null | undefined,
  ): Promise<string | null> {
    const limpo = (nome ?? '').trim().replace(/\s+/g, ' ');
    if (!limpo) return null;

    // As duas tabelas têm o mesmo formato, mas os tipos do Prisma não se
    // unem: o delegate é uma união e a união não é chamável. Duas
    // funções de uma linha custam menos que um `as any`.
    const procurar = () =>
      tabela === 'manufacturer'
        ? this.prisma.manufacturer.findFirst({
            where: { organizationId, name: { equals: limpo, mode: 'insensitive' } },
            select: { id: true },
          })
        : this.prisma.assetModel.findFirst({
            where: { organizationId, name: { equals: limpo, mode: 'insensitive' } },
            select: { id: true },
          });

    const criar = () =>
      tabela === 'manufacturer'
        ? this.prisma.manufacturer.create({
            data: { organizationId, name: limpo },
            select: { id: true },
          })
        : this.prisma.assetModel.create({
            data: { organizationId, name: limpo },
            select: { id: true },
          });

    const existente = await procurar();
    if (existente) return existente.id;

    // Corrida entre duas máquinas varrendo ao mesmo tempo: as duas leem
    // "não existe" e as duas criam. A segunda bate no índice único, e
    // aí a resposta certa é procurar de novo — não falhar a varredura
    // por causa do nome de um fabricante.
    try {
      return (await criar()).id;
    } catch {
      return (await procurar())?.id ?? null;
    }
  }
}

/** Tira os nulos: atributo ausente é diferente de atributo vazio na ficha. */
function semNulos(objeto: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
}
