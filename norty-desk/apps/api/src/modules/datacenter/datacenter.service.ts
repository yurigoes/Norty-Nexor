import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ItemDeRackView, OndeEstaNoRack, RackDetail, RackFace, RackView, SalaView } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ColocarNoRackDto, EditarRackDto, EditarSalaDto, EscreverRackDto, EscreverSalaDto, MoverNoRackDto } from './dto';

type Faixa = { positionU: number; heightU: number; face: RackFace };

/** Duas faces se chocam se forem a mesma, ou se uma delas ocupa a profundidade inteira. */
const facesSeChocam = (a: RackFace, b: RackFace) => a === b || a === 'AMBAS' || b === 'AMBAS';
const topo = (f: Faixa) => f.positionU + f.heightU - 1;

/** Us ocupados em qualquer face. */
export function unidadesOcupadas(itens: Faixa[]): number {
  const us = new Set<number>();
  for (const i of itens) for (let u = i.positionU; u <= topo(i); u++) us.add(u);
  return us.size;
}

/** Faixas livres na frente (o que se enxerga ao abrir o rack), de baixo para cima. */
export function faixasLivres(unidades: number, itens: Faixa[]): { from: number; to: number }[] {
  const ocupado = new Array<boolean>(unidades + 1).fill(false);
  for (const i of itens) {
    if (!facesSeChocam(i.face, 'FRENTE')) continue;
    for (let u = i.positionU; u <= Math.min(topo(i), unidades); u++) ocupado[u] = true;
  }
  const faixas: { from: number; to: number }[] = [];
  for (let u = 1; u <= unidades; u++) {
    if (ocupado[u]) continue;
    const ultima = faixas[faixas.length - 1];
    if (ultima && ultima.to === u - 1) ultima.to = u;
    else faixas.push({ from: u, to: u });
  }
  return faixas;
}

/** O primeiro item que ocupa algum U da faixa pedida, na mesma face. */
export function conflito<T extends Faixa>(pedido: Faixa, itens: T[]): T | undefined {
  return itens.find(
    (i) => facesSeChocam(i.face, pedido.face) && i.positionU <= topo(pedido) && pedido.positionU <= topo(i),
  );
}

/**
 * Salas, racks e onde cada equipamento está no rack.
 *
 * A regra que importa é física: dois equipamentos não ocupam o mesmo U na
 * mesma face, e ninguém passa do topo do rack. A conferência corre com a
 * linha do rack travada (`FOR UPDATE`), então duas pessoas montando o
 * mesmo rack ao mesmo tempo não empilham dois servidores no U 10.
 */
@Injectable()
export class DatacenterService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Salas ----------------------------------------------------------

  async salas(usuario: UsuarioAutenticado): Promise<SalaView[]> {
    const salas = await this.prisma.dcRoom.findMany({
      where: { organizationId: usuario.organizationId },
      include: { location: { select: { id: true, name: true } }, _count: { select: { racks: true } } },
      orderBy: { name: 'asc' },
    });
    return salas.map((s) => ({ id: s.id, name: s.name, location: s.location, notes: s.notes, rackCount: s._count.racks }));
  }

  async criarSala(usuario: UsuarioAutenticado, dto: EscreverSalaDto): Promise<SalaView[]> {
    await this.exigirLocal(usuario, dto.locationId);
    await this.semDuplicata(
      () => this.prisma.dcRoom.create({ data: { organizationId: usuario.organizationId, name: dto.name.trim(), locationId: dto.locationId ?? null, notes: dto.notes ?? null } }),
      `Já existe a sala ${dto.name.trim()}.`,
    );
    return this.salas(usuario);
  }

  async editarSala(usuario: UsuarioAutenticado, id: string, dto: EditarSalaDto): Promise<SalaView[]> {
    await this.exigirSala(usuario, id);
    await this.exigirLocal(usuario, dto.locationId);
    await this.semDuplicata(
      () => this.prisma.dcRoom.update({ where: { id }, data: { name: dto.name?.trim(), locationId: dto.locationId, notes: dto.notes } }),
      'Já existe uma sala com esse nome.',
    );
    return this.salas(usuario);
  }

  async removerSala(usuario: UsuarioAutenticado, id: string): Promise<SalaView[]> {
    await this.exigirSala(usuario, id);
    const racks = await this.prisma.rack.count({ where: { roomId: id } });
    if (racks) throw new ConflictException(`A sala tem ${racks} rack(s): mova-os antes de excluir.`);
    await this.prisma.dcRoom.delete({ where: { id } });
    return this.salas(usuario);
  }

  // --- Racks ----------------------------------------------------------

  async racks(usuario: UsuarioAutenticado): Promise<RackView[]> {
    const racks = await this.prisma.rack.findMany({
      where: { organizationId: usuario.organizationId },
      include: { room: { select: { id: true, name: true } }, items: { select: { positionU: true, heightU: true, face: true } } },
      orderBy: [{ room: { name: 'asc' } }, { name: 'asc' }],
    });
    return racks.map((r) => DatacenterService.rackParaView(r));
  }

  async rack(usuario: UsuarioAutenticado, id: string): Promise<RackDetail> {
    const rack = await this.prisma.rack.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: {
        room: { select: { id: true, name: true } },
        items: {
          include: { asset: { select: { id: true, name: true, tag: true, kind: true } } },
          orderBy: { positionU: 'desc' },
        },
      },
    });
    if (!rack) throw new NotFoundException('Rack não encontrado.');
    return {
      ...DatacenterService.rackParaView(rack),
      items: rack.items.map(
        (i): ItemDeRackView => ({
          id: i.id,
          asset: { ...i.asset, kind: String(i.asset.kind) },
          positionU: i.positionU,
          heightU: i.heightU,
          face: i.face,
        }),
      ),
      freeRanges: faixasLivres(rack.units, rack.items),
    };
  }

  async criarRack(usuario: UsuarioAutenticado, dto: EscreverRackDto): Promise<RackDetail> {
    await this.exigirSalaOpcional(usuario, dto.roomId);
    const rack = await this.semDuplicata(
      () =>
        this.prisma.rack.create({
          data: {
            organizationId: usuario.organizationId,
            name: dto.name.trim(),
            roomId: dto.roomId ?? null,
            units: dto.units ?? 42,
            position: dto.position ?? null,
            notes: dto.notes ?? null,
          },
        }),
      `Já existe o rack ${dto.name.trim()}.`,
    );
    return this.rack(usuario, rack.id);
  }

  async editarRack(usuario: UsuarioAutenticado, id: string, dto: EditarRackDto): Promise<RackDetail> {
    const rack = await this.exigirRack(usuario, id);
    await this.exigirSalaOpcional(usuario, dto.roomId);
    if (dto.units !== undefined && dto.units < rack.units) {
      const maisAlto = await this.prisma.rackItem.findFirst({
        where: { rackId: id },
        orderBy: { positionU: 'desc' },
        select: { positionU: true, heightU: true },
      });
      const alturaUsada = maisAlto ? maisAlto.positionU + maisAlto.heightU - 1 : 0;
      if (alturaUsada > dto.units) {
        throw new ConflictException(`Há equipamento até o U ${alturaUsada}: o rack não pode ter menos que isso.`);
      }
    }
    await this.semDuplicata(
      () => this.prisma.rack.update({ where: { id }, data: { name: dto.name?.trim(), roomId: dto.roomId, units: dto.units, position: dto.position, notes: dto.notes } }),
      'Já existe um rack com esse nome.',
    );
    return this.rack(usuario, id);
  }

  async removerRack(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.exigirRack(usuario, id);
    const itens = await this.prisma.rackItem.count({ where: { rackId: id } });
    if (itens) throw new ConflictException(`O rack tem ${itens} equipamento(s): retire-os antes de excluir.`);
    await this.prisma.rack.delete({ where: { id } });
  }

  // --- Posição no rack -------------------------------------------------

  async colocar(usuario: UsuarioAutenticado, rackId: string, dto: ColocarNoRackDto): Promise<RackDetail> {
    if (!(await this.prisma.asset.count({ where: { id: dto.assetId, organizationId: usuario.organizationId } }))) {
      throw new NotFoundException('Equipamento não encontrado.');
    }
    const onde = await this.prisma.rackItem.findUnique({ where: { assetId: dto.assetId }, include: { rack: { select: { name: true } } } });
    if (onde) throw new ConflictException(`Este equipamento já está no rack ${onde.rack.name} (U ${onde.positionU}): mova-o por lá.`);

    const pedido: Faixa = { positionU: dto.positionU, heightU: dto.heightU ?? 1, face: dto.face ?? 'FRENTE' };
    await this.encaixar(usuario, rackId, pedido, null, (tx) =>
      tx.rackItem.create({ data: { rackId, assetId: dto.assetId, ...pedido } }),
    );
    return this.rack(usuario, rackId);
  }

  async mover(usuario: UsuarioAutenticado, itemId: string, dto: MoverNoRackDto): Promise<RackDetail> {
    const item = await this.prisma.rackItem.findFirst({ where: { id: itemId, rack: { organizationId: usuario.organizationId } } });
    if (!item) throw new NotFoundException('Posição não encontrada.');
    const pedido: Faixa = {
      positionU: dto.positionU ?? item.positionU,
      heightU: dto.heightU ?? item.heightU,
      face: dto.face ?? item.face,
    };
    await this.encaixar(usuario, item.rackId, pedido, itemId, (tx) => tx.rackItem.update({ where: { id: itemId }, data: pedido }));
    return this.rack(usuario, item.rackId);
  }

  async retirar(usuario: UsuarioAutenticado, itemId: string): Promise<RackDetail> {
    const item = await this.prisma.rackItem.findFirst({ where: { id: itemId, rack: { organizationId: usuario.organizationId } } });
    if (!item) throw new NotFoundException('Posição não encontrada.');
    await this.prisma.rackItem.delete({ where: { id: itemId } });
    return this.rack(usuario, item.rackId);
  }

  async doAtivo(usuario: UsuarioAutenticado, assetId: string): Promise<OndeEstaNoRack> {
    if (!(await this.prisma.asset.count({ where: { id: assetId, organizationId: usuario.organizationId } }))) {
      throw new NotFoundException('Equipamento não encontrado.');
    }
    const item = await this.prisma.rackItem.findUnique({
      where: { assetId },
      include: { rack: { select: { id: true, name: true, room: { select: { id: true, name: true } } } } },
    });
    return item ? { itemId: item.id, rack: item.rack, positionU: item.positionU, heightU: item.heightU, face: item.face } : null;
  }

  // -------------------------------------------------------------------

  /** Confere o topo e a sobreposição com o rack travado, e grava na mesma transação. */
  private async encaixar(
    usuario: UsuarioAutenticado,
    rackId: string,
    pedido: Faixa,
    ignorarItemId: string | null,
    gravar: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    const rack = await this.exigirRack(usuario, rackId);
    if (topo(pedido) > rack.units) {
      throw new BadRequestException(`Não cabe: iria até o U ${topo(pedido)}, e o rack tem ${rack.units}.`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM racks WHERE id = ${rackId}::uuid FOR UPDATE`;
      const itens = await tx.rackItem.findMany({
        where: { rackId, ...(ignorarItemId ? { NOT: { id: ignorarItemId } } : {}) },
        include: { asset: { select: { name: true } } },
      });
      const choque = conflito(pedido, itens);
      if (choque) {
        throw new ConflictException(
          `Os Us ${pedido.positionU}–${topo(pedido)} já têm ${choque.asset.name} (U ${choque.positionU}–${topo(choque)}).`,
        );
      }
      await gravar(tx);
    });
  }

  static rackParaView(r: {
    id: string;
    name: string;
    units: number;
    position: string | null;
    notes: string | null;
    room: { id: string; name: string } | null;
    items: Faixa[];
  }): RackView {
    return { id: r.id, name: r.name, room: r.room, units: r.units, usedUnits: unidadesOcupadas(r.items), position: r.position, notes: r.notes };
  }

  private async exigirRack(usuario: UsuarioAutenticado, id: string) {
    const rack = await this.prisma.rack.findFirst({ where: { id, organizationId: usuario.organizationId } });
    if (!rack) throw new NotFoundException('Rack não encontrado.');
    return rack;
  }

  private async exigirSala(usuario: UsuarioAutenticado, id: string) {
    const sala = await this.prisma.dcRoom.findFirst({ where: { id, organizationId: usuario.organizationId } });
    if (!sala) throw new NotFoundException('Sala não encontrada.');
    return sala;
  }

  private async exigirSalaOpcional(usuario: UsuarioAutenticado, id: string | null | undefined) {
    if (id) await this.exigirSala(usuario, id);
  }

  private async exigirLocal(usuario: UsuarioAutenticado, id: string | null | undefined) {
    if (id && !(await this.prisma.location.count({ where: { id, organizationId: usuario.organizationId } }))) {
      throw new NotFoundException('Localização não encontrada.');
    }
  }

  private async semDuplicata<T>(operacao: () => Promise<T>, mensagem: string): Promise<T> {
    try {
      return await operacao();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(mensagem);
      throw e;
    }
  }
}
