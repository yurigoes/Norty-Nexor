import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FACES_DO_PAINEL,
  desenharPainel,
  numeroDaPorta,
  portasDoPainel,
  type FaceDoPainel,
  type FaceDoPainelDoAtivo,
  type GradeDoPainel,
  type PainelDoAtivo,
  type PainelDoModeloView,
  type PortaNoPainel,
  type ZonaDoPainel,
} from '@norty-desk/shared';
import type { ModelPanel, PanelZone } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/** O painel com as zonas, como o banco o devolve. */
type PainelComZonas = ModelPanel & { zones: PanelZone[] };

/**
 * O estêncil: onde cada porta fica no painel do equipamento.
 *
 * O desenho em si é função pura em `packages/shared/src/painel.ts` — a
 * grade, as zonas e a leitura do número no nome da porta. Aqui mora o
 * que precisa de banco: guardar o painel do modelo e, do lado do
 * equipamento, pôr as portas dele sobre o desenho.
 *
 * ## Por que no modelo, e não no equipamento
 *
 * Trinta switches do mesmo modelo têm o mesmo painel. Descrevê-lo trinta
 * vezes é trinta chances de divergir, e o dia em que divergem é o dia em
 * que o desenho deixa de ser confiável — que é o único valor que ele
 * tem. O equipamento empresta o painel do modelo dele.
 *
 * ## O que liga a porta ao desenho
 *
 * O painel numera de 1 a 24; o equipamento chama a mesma porta de
 * `GigabitEthernet1/0/24`. `numeroDaPorta` faz a ponte, e é por isso que
 * ninguém precisa digitar a posição de cada porta em cada switch.
 *
 * Duas consequências que a API não esconde:
 *
 * - **Porta sem lugar aparece em `outside`.** Um switch de 24 com uma
 *   porta 25, ou uma porta chamada só `Ethernet`: ela não entra no
 *   desenho, mas é listada. Sumir com ela calada faria o painel parecer
 *   certo justamente quando está errado.
 * - **Duas portas na mesma posição aparecem as duas.** `Gi1/0/1` e
 *   `Te1/0/1` dão o mesmo número; escolher uma em silêncio seria
 *   apontar o dedo para a porta errada com ar de certeza.
 */
@Injectable()
export class PainelService {
  constructor(private readonly prisma: PrismaService) {}

  /** Os painéis de um modelo, frente antes de trás. */
  async doModelo(usuario: UsuarioAutenticado, assetModelId: string): Promise<PainelDoModeloView[]> {
    await this.exigirModelo(usuario, assetModelId);

    const paineis = await this.prisma.modelPanel.findMany({
      where: { organizationId: usuario.organizationId, assetModelId },
      include: { zones: { orderBy: [{ column: 'asc' }, { row: 'asc' }] } },
      orderBy: { face: 'asc' },
    });

    return paineis.map((p) => PainelService.paraTela(p));
  }

  /**
   * Cria ou substitui o painel de uma face.
   *
   * `PUT`, e não `POST` com `PATCH` ao lado: há um painel por face (é
   * `@@unique` no banco), então "mandar como a frente é" descreve a
   * operação melhor do que decidir, a cada chamada, se é a primeira vez.
   *
   * As zonas sobrevivem à troca da grade de propósito: mudar 12×2 para
   * 24×2 não é motivo para quem cadastrou a porta de console ter de
   * cadastrá-la de novo. O que fica fora da grade nova é recusado —
   * zona em coluna que não existe mais é desenho que o aplicativo não
   * sabe mostrar.
   */
  async escrever(
    usuario: UsuarioAutenticado,
    assetModelId: string,
    face: FaceDoPainel,
    dados: {
      columns: number;
      rows?: number;
      numbering?: 'COLUNA' | 'LINHA';
      startAt?: number;
      slots?: number | null;
      notes?: string | null;
    },
  ): Promise<PainelDoModeloView[]> {
    await this.exigirModelo(usuario, assetModelId);

    const dadosDoPainel = {
      columns: dados.columns,
      rows: dados.rows ?? 1,
      numbering: dados.numbering ?? ('COLUNA' as const),
      startAt: dados.startAt ?? 1,
      slots: dados.slots ?? null,
      notes: dados.notes ?? null,
    };

    const atual = await this.prisma.modelPanel.findUnique({
      where: { assetModelId_face: { assetModelId, face } },
      include: { zones: true },
    });

    const foraDaGrade = (atual?.zones ?? []).filter(
      (z) => z.column > dadosDoPainel.columns || z.row > dadosDoPainel.rows,
    );

    if (foraDaGrade.length > 0) {
      const lista = foraDaGrade.map((z) => `coluna ${z.column}, linha ${z.row}`).join('; ');
      throw new BadRequestException(
        `A grade de ${dadosDoPainel.columns}×${dadosDoPainel.rows} deixaria de fora ${foraDaGrade.length} zona(s) já cadastrada(s) (${lista}). Apague-as primeiro, ou use uma grade que as comporte.`,
      );
    }

    await this.prisma.modelPanel.upsert({
      where: { assetModelId_face: { assetModelId, face } },
      create: { organizationId: usuario.organizationId, assetModelId, face, ...dadosDoPainel },
      update: dadosDoPainel,
    });

    return this.doModelo(usuario, assetModelId);
  }

  async remover(
    usuario: UsuarioAutenticado,
    assetModelId: string,
    face: FaceDoPainel,
  ): Promise<PainelDoModeloView[]> {
    const painel = await this.exigirPainel(usuario, assetModelId, face);

    // As zonas vão por cascata: sem o painel, elas desenham sobre nada.
    await this.prisma.modelPanel.delete({ where: { id: painel.id } });
    return this.doModelo(usuario, assetModelId);
  }

  async criarZona(
    usuario: UsuarioAutenticado,
    assetModelId: string,
    face: FaceDoPainel,
    dados: {
      column: number;
      row: number;
      kind?: 'PORTA' | 'TOMADA' | 'CONSOLE' | 'ENERGIA' | 'VAZIO';
      label?: string | null;
      portNumber?: number | null;
    },
  ): Promise<PainelDoModeloView[]> {
    const painel = await this.exigirPainel(usuario, assetModelId, face);
    this.exigirDentroDaGrade(painel, dados.column, dados.row);

    const ocupada = await this.prisma.panelZone.findUnique({
      where: { panelId_column_row: { panelId: painel.id, column: dados.column, row: dados.row } },
    });

    if (ocupada) {
      throw new BadRequestException(
        `Já há uma zona na coluna ${dados.column}, linha ${dados.row}. Edite a que existe.`,
      );
    }

    await this.prisma.panelZone.create({
      data: {
        panelId: painel.id,
        column: dados.column,
        row: dados.row,
        kind: dados.kind ?? 'PORTA',
        label: dados.label ?? null,
        portNumber: dados.portNumber ?? null,
      },
    });

    return this.doModelo(usuario, assetModelId);
  }

  async editarZona(
    usuario: UsuarioAutenticado,
    assetModelId: string,
    face: FaceDoPainel,
    zonaId: string,
    dados: {
      column: number;
      row: number;
      kind?: 'PORTA' | 'TOMADA' | 'CONSOLE' | 'ENERGIA' | 'VAZIO';
      label?: string | null;
      portNumber?: number | null;
    },
  ): Promise<PainelDoModeloView[]> {
    const painel = await this.exigirPainel(usuario, assetModelId, face);
    this.exigirDentroDaGrade(painel, dados.column, dados.row);

    const zona = await this.prisma.panelZone.findFirst({
      where: { id: zonaId, panelId: painel.id },
    });
    if (!zona) throw new NotFoundException('Zona não encontrada neste painel.');

    const vizinha = await this.prisma.panelZone.findUnique({
      where: { panelId_column_row: { panelId: painel.id, column: dados.column, row: dados.row } },
    });

    if (vizinha && vizinha.id !== zonaId) {
      throw new BadRequestException(
        `Já há outra zona na coluna ${dados.column}, linha ${dados.row}.`,
      );
    }

    await this.prisma.panelZone.update({
      where: { id: zonaId },
      data: {
        column: dados.column,
        row: dados.row,
        kind: dados.kind ?? 'PORTA',
        label: dados.label ?? null,
        portNumber: dados.portNumber ?? null,
      },
    });

    return this.doModelo(usuario, assetModelId);
  }

  async removerZona(
    usuario: UsuarioAutenticado,
    assetModelId: string,
    face: FaceDoPainel,
    zonaId: string,
  ): Promise<PainelDoModeloView[]> {
    const painel = await this.exigirPainel(usuario, assetModelId, face);

    const zona = await this.prisma.panelZone.findFirst({
      where: { id: zonaId, panelId: painel.id },
    });
    if (!zona) throw new NotFoundException('Zona não encontrada neste painel.');

    await this.prisma.panelZone.delete({ where: { id: zonaId } });
    return this.doModelo(usuario, assetModelId);
  }

  /**
   * O painel do equipamento: o desenho do modelo com as portas dele.
   *
   * Nulo quando o equipamento não tem modelo, ou o modelo não tem painel
   * — e aí a tela não desenha nada, em vez de uma grade vazia que parece
   * defeito.
   */
  async doAtivo(usuario: UsuarioAutenticado, assetId: string): Promise<PainelDoAtivo> {
    const ativo = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId: usuario.organizationId },
      select: { id: true, assetModel: { select: { id: true, name: true } } },
    });
    if (!ativo) throw new NotFoundException('Equipamento não encontrado.');
    if (!ativo.assetModel) return null;

    const paineis = await this.prisma.modelPanel.findMany({
      where: { organizationId: usuario.organizationId, assetModelId: ativo.assetModel.id },
      include: { zones: { orderBy: [{ column: 'asc' }, { row: 'asc' }] } },
      orderBy: { face: 'asc' },
    });
    if (paineis.length === 0) return null;

    const portas = await this.prisma.networkPort.findMany({
      where: { organizationId: usuario.organizationId, assetId },
      select: {
        id: true,
        name: true,
        currentIp: true,
        vlan: { select: { tag: true } },
        connectedTo: {
          select: { id: true, name: true, asset: { select: { id: true, name: true, tag: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const porNumero = new Map<number, PortaNoPainel[]>();
    const semNumero: PortaNoPainel[] = [];

    for (const p of portas) {
      const porta: PortaNoPainel = {
        id: p.id,
        name: p.name,
        connectedTo: p.connectedTo,
        vlan: p.vlan?.tag ?? null,
        currentIp: p.currentIp,
      };

      const numero = numeroDaPorta(p.name);
      if (numero === null) {
        semNumero.push(porta);
        continue;
      }
      porNumero.set(numero, [...(porNumero.get(numero) ?? []), porta]);
    }

    // Quem já entrou num desenho não entra noutro: a mesma porta em duas
    // faces seriam duas respostas para "onde ela fica".
    const colocadas = new Set<string>();

    const faces: FaceDoPainelDoAtivo[] = paineis.map((painel) => ({
      face: painel.face,
      columns: painel.columns,
      rows: painel.rows,
      cells: desenharPainel(PainelService.grade(painel), PainelService.zonas(painel)).map((c) => {
        const candidatas = c.numero === null ? [] : (porNumero.get(c.numero) ?? []);
        const aqui = candidatas.filter((p) => !colocadas.has(p.id));
        for (const p of aqui) colocadas.add(p.id);
        return { ...c, ports: aqui };
      }),
    }));

    const outside = [
      ...semNumero,
      ...[...porNumero.values()].flat().filter((p) => !colocadas.has(p.id)),
    ];

    return { model: ativo.assetModel, faces, outside };
  }

  // -------------------------------------------------------------------

  private static grade(painel: ModelPanel): GradeDoPainel {
    return {
      columns: painel.columns,
      rows: painel.rows,
      numbering: painel.numbering,
      startAt: painel.startAt,
      slots: painel.slots,
    };
  }

  private static zonas(painel: PainelComZonas): ZonaDoPainel[] {
    return painel.zones.map((z) => ({
      column: z.column,
      row: z.row,
      kind: z.kind,
      label: z.label,
      portNumber: z.portNumber,
    }));
  }

  private static paraTela(painel: PainelComZonas): PainelDoModeloView {
    return {
      id: painel.id,
      face: painel.face,
      columns: painel.columns,
      rows: painel.rows,
      numbering: painel.numbering,
      startAt: painel.startAt,
      slots: painel.slots,
      notes: painel.notes,
      zones: painel.zones.map((z) => ({
        id: z.id,
        column: z.column,
        row: z.row,
        kind: z.kind,
        label: z.label,
        portNumber: z.portNumber,
      })),
      portCount: portasDoPainel(PainelService.grade(painel), PainelService.zonas(painel)),
    };
  }

  /** Regra 3 do CLAUDE.md: todo `where` começa pela organização. */
  private async exigirModelo(usuario: UsuarioAutenticado, assetModelId: string) {
    const modelo = await this.prisma.assetModel.findFirst({
      where: { id: assetModelId, organizationId: usuario.organizationId },
      select: { id: true, name: true },
    });
    if (!modelo) throw new NotFoundException('Modelo de equipamento não encontrado.');
    return modelo;
  }

  private async exigirPainel(
    usuario: UsuarioAutenticado,
    assetModelId: string,
    face: FaceDoPainel,
  ): Promise<PainelComZonas> {
    await this.exigirModelo(usuario, assetModelId);

    const painel = await this.prisma.modelPanel.findFirst({
      where: { organizationId: usuario.organizationId, assetModelId, face },
      include: { zones: true },
    });
    if (!painel) {
      throw new NotFoundException(
        `Este modelo não tem painel cadastrado na face ${face === 'FRENTE' ? 'da frente' : 'de trás'}.`,
      );
    }
    return painel;
  }

  private exigirDentroDaGrade(painel: ModelPanel, column: number, row: number) {
    if (column > painel.columns || row > painel.rows) {
      throw new BadRequestException(
        `A posição (coluna ${column}, linha ${row}) está fora da grade de ${painel.columns}×${painel.rows}.`,
      );
    }
  }

  /** A face do caminho da URL, recusando o que não é face. */
  static face(bruta: string): FaceDoPainel {
    const face = bruta.toUpperCase();
    if (!(FACES_DO_PAINEL as readonly string[]).includes(face)) {
      throw new BadRequestException(`Face desconhecida: "${bruta}". Use FRENTE ou TRAS.`);
    }
    return face as FaceDoPainel;
  }
}
