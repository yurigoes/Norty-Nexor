import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import type { ComponentKind, InventarioResponse } from '@norty-desk/shared';
import { serieUtil, validarAtributos } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import { normalizarIp, normalizarMac } from '../../common/ip';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DicionarioDeFabricante } from '../catalogo-ativo/fabricantes.dicionario';
import { DicionarioDeModelo } from '../catalogo-ativo/modelos.dicionario';
import { DicionarioDeSistemaOperacional } from '../catalogo-ativo/sistemas.dicionario';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly fabricantes: DicionarioDeFabricante,
    private readonly modelos: DicionarioDeModelo,
    private readonly sistemas: DicionarioDeSistemaOperacional,
  ) {}

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

    // O fabricante vem **antes** do modelo, e não em paralelo com ele:
    // a chave do modelo tira o nome do fabricante da frente ("HP
    // EliteBook 840 G8" é o mesmo que "EliteBook 840 G8"), e o id dele
    // é o que a linha nova do catálogo grava. Duas idas ao banco em
    // sequência valem menos que um catálogo com o modelo órfão.
    const manufacturerId = await this.fabricantes.resolver(organizationId, dto.manufacturer);

    const [assetModelId, sistema] = await Promise.all([
      this.modelos.resolver(organizationId, dto.model, {
        id: manufacturerId,
        texto: dto.manufacturer,
      }),
      this.sistemas.resolver(organizationId, dto.os?.name, dto.os?.version),
    ]);

    const daMaquina = {
      deviceUuid: uuid,
      hostname: dto.hostname.trim(),
      // O caption cru fica: é o diagnóstico de quando a classificação
      // errar. O que o relatório agrupa são as duas colunas ao lado.
      osName: dto.os?.name?.trim() || null,
      osVersion: dto.os?.version?.trim() || null,
      osProduct: sistema.produto,
      osEdition: sistema.edicao,
      agentVersion: dto.agente?.versao?.trim() || null,
      lastSeenAt: agora,
    };

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
    const rede = await this.reconciliarRede(organizationId, assetId, dto, agora);

    this.logger.log(
      `Inventário de ${dto.hostname}: ${achado.por === 'NOVO' ? 'cadastrada' : 'atualizada'} ` +
        `(${achado.por}), ${componentes.criados} peça(s) nova(s), ` +
        `${componentes.removidos} removida(s), ` +
        `${rede.portas.criadas} porta(s) nova(s).`,
    );

    for (const conflito of rede.conflitos) {
      // Dois endereços iguais na mesma rede é incidente, e o agente não
      // tem como resolvê-lo. O que ele pode fazer é não deixar passar
      // em silêncio.
      this.logger.warn(`Inventário de ${dto.hostname}: ${conflito}`);
    }

    return {
      assetId,
      criado: achado.por === 'NOVO',
      reconhecidoPor: achado.por,
      componentes,
      rede,
    };
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
  // Rede
  // -------------------------------------------------------------------

  /**
   * As placas da máquina, e o que elas respondem.
   *
   * O ponto difícil aqui não é gravar porta: é **o endereço**. Máquina
   * com DHCP pega 192.168.1.50 hoje e .87 amanhã, e gravar isso como
   * cadastro produz um IPAM que mente no dia seguinte — pior, a próxima
   * máquina a receber .50 colide com o registro da anterior e a
   * varredura dela passa a falhar.
   *
   * A separação que faz isso funcionar:
   *
   * - **Endereço emprestado é instantâneo.** Fica em `currentIp` na
   *   porta, responde "que máquina estava aqui" e não promete mais que
   *   isso.
   * - **Endereço fixo é cadastro.** Vira linha em `ip_addresses`,
   *   porque alguém digitou aquilo na máquina de propósito e o IPAM
   *   existe para planejar exatamente isso.
   *
   * E a identidade da porta é o **MAC**, não o nome: "Ethernet" é o
   * nome de metade das placas do parque, e a mesma placa USB passa de
   * máquina em máquina levando o MAC junto.
   */
  private async reconciliarRede(
    organizationId: string,
    assetId: string,
    dto: InventarioDto,
    agora: Date,
  ): Promise<InventarioResponse['rede']> {
    const vazio = {
      portas: { criadas: 0, atualizadas: 0, removidas: 0 },
      enderecos: 0,
      conflitos: [] as string[],
    };

    // Ausente é "o agente não olhou"; lista vazia é "olhou e não achou
    // placa nenhuma". Só a segunda pode remover o que estava lá — senão
    // um agente velho, que não manda o campo, limparia a rede do parque
    // inteiro na primeira varredura.
    if (!dto.portas) return vazio;

    const existentes = await this.prisma.networkPort.findMany({
      where: { assetId, organizationId },
      select: { id: true, name: true, mac: true, managedByAgent: true },
    });

    const porMac = new Map(existentes.filter((p) => p.mac).map((p) => [p.mac!, p]));
    const porNome = new Map(existentes.map((p) => [p.name, p]));
    const vistas = new Set<string>();

    let criadas = 0;
    let atualizadas = 0;
    let enderecos = 0;
    const conflitos: string[] = [];

    for (const porta of dto.portas) {
      const nome = porta.name.trim();
      if (!nome) continue;

      const mac = porta.mac ? normalizarMac(porta.mac) : null;
      const daMesma = mac ? porMac.get(mac) : porNome.get(nome);

      const dados = {
        name: nome,
        mac,
        speedMbps: porta.velocidadeMbps ?? null,
        dhcp: porta.enderecos?.some((e) => e.dhcp) ?? null,
        managedByAgent: true,
      };

      let portId: string;

      if (daMesma) {
        await this.prisma.networkPort.update({ where: { id: daMesma.id }, data: dados });
        portId = daMesma.id;
        vistas.add(daMesma.id);
        atualizadas += 1;
      } else {
        // O MAC é único na organização: a mesma placa USB que mudou de
        // máquina já tem linha em outro ativo, e o certo é trazê-la —
        // é a mesma placa, não uma segunda.
        const deOutra = mac
          ? await this.prisma.networkPort.findFirst({
              where: { organizationId, mac },
              select: { id: true },
            })
          : null;

        if (deOutra) {
          await this.prisma.networkPort.update({
            where: { id: deOutra.id },
            data: { ...dados, assetId },
          });
          portId = deOutra.id;
          atualizadas += 1;
        } else {
          const nova = await this.prisma.networkPort.create({
            data: { organizationId, assetId, ...dados },
            select: { id: true },
          });
          portId = nova.id;
          criadas += 1;
        }

        vistas.add(portId);
      }

      const resultado = await this.gravarEnderecos(
        organizationId,
        assetId,
        portId,
        porta.enderecos ?? [],
        agora,
      );

      enderecos += resultado.gravados;
      conflitos.push(...resultado.conflitos);
    }

    // O que sumiu da varredura sai — mas só o que é do agente. A porta
    // que alguém cadastrou à mão no switch fica, mesmo que nenhuma
    // varredura a enxergue: ela nunca foi de varredura nenhuma.
    const removidas = existentes.filter((p) => p.managedByAgent && !vistas.has(p.id));

    if (removidas.length > 0) {
      await this.prisma.networkPort.deleteMany({
        where: { id: { in: removidas.map((p) => p.id) } },
      });
    }

    return { portas: { criadas, atualizadas, removidas: removidas.length }, enderecos, conflitos };
  }

  /**
   * Os endereços de uma placa.
   *
   * O fixo entra no IPAM; o emprestado fica como instantâneo. E o fixo
   * que **outra** máquina já reivindica não é roubado: duas máquinas no
   * mesmo endereço é incidente de rede de verdade, e trocar o dono do
   * registro trocaria o sintoma por um cadastro errado e calado.
   */
  private async gravarEnderecos(
    organizationId: string,
    assetId: string,
    portId: string,
    lista: { endereco: string; dhcp?: boolean }[],
    agora: Date,
  ): Promise<{ gravados: number; conflitos: string[] }> {
    const conflitos: string[] = [];
    let gravados = 0;

    const validos = lista
      .map((e) => ({ ip: normalizarIp(e.endereco), dhcp: e.dhcp === true }))
      .filter((e): e is { ip: string; dhcp: boolean } => e.ip !== null);

    // O instantâneo é o primeiro endereço que a placa respondeu, fixo ou
    // não: a pergunta "quem está neste endereço" vale para os dois.
    await this.prisma.networkPort.update({
      where: { id: portId },
      data: {
        currentIp: validos[0]?.ip ?? null,
        currentIpAt: validos[0] ? agora : null,
      },
    });

    const fixos = validos.filter((e) => !e.dhcp);

    for (const { ip } of fixos) {
      const existente = await this.prisma.ipAddress.findFirst({
        where: { organizationId, address: ip },
        select: { id: true, assetId: true },
      });

      if (existente && existente.assetId && existente.assetId !== assetId) {
        const dono = await this.prisma.asset.findUnique({
          where: { id: existente.assetId },
          select: { name: true },
        });

        conflitos.push(
          `O endereço fixo ${ip} já está cadastrado em "${dono?.name ?? 'outro equipamento'}". ` +
            'Duas máquinas no mesmo endereço: o cadastro não foi alterado.',
        );
        continue;
      }

      const networkId = await this.redeQueContem(organizationId, ip);

      if (existente) {
        await this.prisma.ipAddress.update({
          where: { id: existente.id },
          data: { assetId, portId, networkId, managedByAgent: true },
        });
      } else {
        await this.prisma.ipAddress.create({
          data: { organizationId, address: ip, assetId, portId, networkId, managedByAgent: true },
        });
      }

      gravados += 1;
    }

    // O fixo que sumiu da placa solta a máquina, mas não some do IPAM:
    // o endereço continua planejado, e deixa de dizer que aquela
    // máquina atende ali — que é o que faria o próximo técnico tentar
    // alcançá-la num endereço morto. Só o que o agente reivindicou.
    const aindaFixos = fixos.map((e) => e.ip);

    await this.prisma.$executeRaw`
      UPDATE ip_addresses
         SET "assetId" = NULL, "portId" = NULL, "managedByAgent" = false, "updatedAt" = NOW()
       WHERE "organizationId" = ${organizationId}::uuid
         AND "portId" = ${portId}::uuid
         AND "managedByAgent" = true
         AND NOT (host(address) = ANY(${aindaFixos}::text[]))
    `;

    return { gravados, conflitos };
  }

  /** A sub-rede mais específica que contém o endereço. */
  private async redeQueContem(organizationId: string, endereco: string): Promise<string | null> {
    const [rede] = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM ip_networks
       WHERE "organizationId" = ${organizationId}::uuid AND ${endereco}::inet <<= cidr
       ORDER BY masklen(cidr) DESC
       LIMIT 1
    `);

    return rede?.id ?? null;
  }
}

/** Tira os nulos: atributo ausente é diferente de atributo vazio na ficha. */
function semNulos(objeto: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
}
