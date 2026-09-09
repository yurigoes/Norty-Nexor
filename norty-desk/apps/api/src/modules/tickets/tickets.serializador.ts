import type {
  AttachmentView,
  CommitmentView,
  EventPayload,
  PartyRef,
  TicketDetail,
  TicketEventView,
  TicketListItem,
  Scale,
} from '@norty-desk/shared';
import type { Prisma } from '@prisma/client';

/**
 * Traduz o que o Prisma devolve para os contratos de `packages/shared`.
 *
 * Existe um lugar só para isso porque a fronteira da API é onde o
 * formato interno vira formato público: se cada controller montasse o
 * seu, os dois divergiriam na primeira pressa.
 */

export const INCLUDE_LISTA = {
  category: true,
  actors: { include: { user: true, team: true, supplier: true, contact: true } },
  commitments: { include: { agreement: true } },
} satisfies Prisma.TicketInclude;

export const INCLUDE_DETALHE = {
  ...INCLUDE_LISTA,
  pendingReason: true,
  links: { include: { target: true } },
  problem: { select: { id: true, number: true, title: true, isKnownError: true, workaround: true } },
  change: { select: { id: true, number: true, title: true, status: true, windowStart: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.TicketInclude;

export const INCLUDE_EVENTO = {
  author: true,
  attachments: true,
} satisfies Prisma.TicketEventInclude;

type ChamadoLista = Prisma.TicketGetPayload<{ include: typeof INCLUDE_LISTA }>;
type ChamadoDetalhe = Prisma.TicketGetPayload<{ include: typeof INCLUDE_DETALHE }>;
type Evento = Prisma.TicketEventGetPayload<{ include: typeof INCLUDE_EVENTO }>;
type Ator = ChamadoLista['actors'][number];

/** O ator carrega exatamente um alvo — o CHECK do banco garante. */
function parte(ator: Ator): PartyRef | null {
  if (ator.user) {
    return { kind: 'USER', id: ator.user.id, name: ator.user.name, email: ator.user.email };
  }
  if (ator.team) {
    return {
      kind: 'TEAM',
      id: ator.team.id,
      name: ator.team.name,
      email: ator.team.email ?? undefined,
    };
  }
  if (ator.supplier) {
    return { kind: 'SUPPLIER', id: ator.supplier.id, name: ator.supplier.name };
  }
  if (ator.contact) {
    return {
      kind: 'CONTACT',
      id: ator.contact.id,
      name: ator.contact.name ?? ator.contact.email ?? ator.contact.phone ?? 'Contato',
      email: ator.contact.email ?? undefined,
      phone: ator.contact.phone ?? undefined,
    };
  }
  return null;
}

function primeiroAtor(chamado: ChamadoLista, papel: Ator['role'], tipo?: 'USER' | 'TEAM'): PartyRef | null {
  for (const ator of chamado.actors) {
    if (ator.role !== papel) continue;
    const p = parte(ator);
    if (!p) continue;
    if (tipo && p.kind !== tipo) continue;
    return p;
  }
  return null;
}

function compromisso(
  c: ChamadoLista['commitments'][number],
  agora = Date.now(),
): CommitmentView {
  return {
    kind: c.kind,
    target: c.target,
    dueAt: c.dueAt.toISOString(),
    achievedAt: c.achievedAt?.toISOString() ?? null,
    breachedAt: c.breachedAt?.toISOString() ?? null,
    // Negativo quando o prazo já passou. O cliente não recalcula prazo:
    // recebe o quanto falta e mostra.
    remainingSeconds: Math.round((c.dueAt.getTime() - agora) / 1000),
  };
}

/**
 * Ordem dos compromissos: o que ainda corre vem primeiro, e entre eles o
 * que vence antes. É o que a fila mostra numa coluna só.
 */
function ordenarCompromissos(chamado: ChamadoLista): CommitmentView[] {
  const agora = Date.now();
  return chamado.commitments
    .map((c) => compromisso(c, agora))
    .sort((a, b) => {
      const aAberto = a.achievedAt === null ? 0 : 1;
      const bAberto = b.achievedAt === null ? 0 : 1;
      if (aAberto !== bAberto) return aAberto - bAberto;
      return a.remainingSeconds - b.remainingSeconds;
    });
}

export function paraLista(chamado: ChamadoLista): TicketListItem {
  return {
    id: chamado.id,
    number: chamado.number,
    subject: chamado.subject,
    type: chamado.type,
    status: chamado.status,
    urgency: chamado.urgency as Scale,
    impact: chamado.impact as Scale,
    priority: chamado.priority as Scale,
    originChannel: chamado.originChannel,
    category: chamado.category ? { id: chamado.category.id, name: chamado.category.name } : null,
    requester: primeiroAtor(chamado, 'REQUERENTE'),
    assignedTeam: primeiroAtor(chamado, 'ATRIBUIDO', 'TEAM'),
    assignedUser: primeiroAtor(chamado, 'ATRIBUIDO', 'USER'),
    commitments: ordenarCompromissos(chamado),
    createdAt: chamado.createdAt.toISOString(),
    updatedAt: chamado.updatedAt.toISOString(),
  };
}

export function paraDetalhe(chamado: ChamadoDetalhe): TicketDetail {
  return {
    ...paraLista(chamado),
    description: chamado.description,
    actors: chamado.actors
      .map((ator) => ({ id: ator.id, role: ator.role, party: parte(ator) }))
      .filter((a): a is { id: string; role: Ator['role']; party: PartyRef } => a.party !== null),
    pendingReason: chamado.pendingReason
      ? { id: chamado.pendingReason.id, name: chamado.pendingReason.name }
      : null,
    pendingSince: chamado.pendingSince?.toISOString() ?? null,
    firstResponseAt: chamado.firstResponseAt?.toISOString() ?? null,
    solvedAt: chamado.solvedAt?.toISOString() ?? null,
    closedAt: chamado.closedAt?.toISOString() ?? null,
    spentSeconds: chamado.spentSeconds,
    customFields: (chamado.customFields as Record<string, unknown> | null) ?? null,
    links: chamado.links.map((v) => ({
      id: v.id,
      type: v.type,
      ticket: { id: v.target.id, number: v.target.number, subject: v.target.subject },
    })),
    attachmentCount: chamado._count.attachments,
    problem: chamado.problem,
    change: chamado.change
      ? { ...chamado.change, windowStart: chamado.change.windowStart?.toISOString() ?? null }
      : null,
  };
}

function anexo(a: Evento['attachments'][number]): AttachmentView {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    checksum: a.checksum,
    eventId: a.eventId,
    createdAt: a.createdAt.toISOString(),
  };
}

export function paraEvento(evento: Evento): TicketEventView {
  return {
    id: evento.id,
    type: evento.type,
    visibility: evento.visibility,
    channel: evento.channel,
    author: evento.author
      ? {
          kind: 'USER',
          id: evento.author.id,
          name: evento.author.name,
          email: evento.author.email,
        }
      : null,
    body: evento.body,
    payload: (evento.payload as EventPayload | null) ?? null,
    attachments: evento.attachments.map(anexo),
    createdAt: evento.createdAt.toISOString(),
    editedAt: evento.editedAt?.toISOString() ?? null,
  };
}
