/* Comunicados, documentos e assembleias. */

import { byId, insert, nextId, update, where } from '../data/repositories';
import type { Announcement, Assembly, DocumentFile, ID } from '../data/types';
import { pushNotification } from './notifications';
import { recordAudit } from './audit';

/* ---------------- Comunicados ---------------- */

export function announcements(condominiumId: ID): Announcement[] {
  return where('announcements', (a) => a.condominiumId === condominiumId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.publishedAt < b.publishedAt ? 1 : -1;
    });
}

export interface PublishAnnouncementInput {
  condominiumId: ID;
  title: string;
  body: string;
  priority: Announcement['priority'];
  audience: Announcement['audience'];
  author: string;
  pinned: boolean;
}

export function publishAnnouncement(input: PublishAnnouncementInput): Announcement {
  const announcement: Announcement = {
    id: nextId('ann'),
    publishedAt: new Date().toISOString(),
    readBy: [],
    ...input,
  };
  insert('announcements', announcement);

  pushNotification({
    condominiumId: input.condominiumId,
    kind: 'aviso',
    title: input.priority === 'urgente' ? `Urgente: ${input.title}` : input.title,
    body: input.body.slice(0, 140),
    link: '/app/comunicados',
    refId: announcement.id,
  });

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.author,
    actorRole: 'sindico',
    action: 'Publicou comunicado',
    target: input.title,
    detail: `Destinatários: ${input.audience.label} · Prioridade ${input.priority}`,
    module: 'Comunicados',
  });

  return announcement;
}

export function markAnnouncementRead(id: ID, userId: ID): void {
  const announcement = byId('announcements', id);
  if (!announcement || announcement.readBy.includes(userId)) return;
  update('announcements', id, { readBy: [...announcement.readBy, userId] });
}

export const ANNOUNCEMENT_PRIORITY_LABEL: Record<Announcement['priority'], string> = {
  normal: 'Normal',
  importante: 'Importante',
  urgente: 'Urgente',
};

export function announcementTone(priority: Announcement['priority']) {
  switch (priority) {
    case 'urgente': return 'danger' as const;
    case 'importante': return 'warning' as const;
    default: return 'info' as const;
  }
}

/* ---------------- Documentos ---------------- */

export function documents(condominiumId: ID): DocumentFile[] {
  return where('documents', (d) => d.condominiumId === condominiumId)
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentFile['category'], string> = {
  convencao: 'Convenção',
  regimento: 'Regimento interno',
  atas: 'Atas',
  contratos: 'Contratos',
  balancetes: 'Balancetes',
  comunicados: 'Comunicados',
  administrativo: 'Administrativo',
};

export function registerDownload(id: ID): void {
  const doc = byId('documents', id);
  if (!doc) return;
  update('documents', id, { downloads: doc.downloads + 1 });
}

export function uploadDocument(input: Omit<DocumentFile, 'id' | 'uploadedAt' | 'downloads'>): DocumentFile {
  const doc: DocumentFile = {
    id: nextId('doc'),
    uploadedAt: new Date().toISOString(),
    downloads: 0,
    ...input,
  };
  insert('documents', doc);
  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.uploadedBy,
    actorRole: 'sindico',
    action: 'Fez upload de documento',
    target: input.name,
    detail: DOCUMENT_CATEGORY_LABEL[input.category],
    module: 'Documentos',
  });
  return doc;
}

/* ---------------- Assembleias ---------------- */

export function assemblies(condominiumId: ID): Assembly[] {
  return where('assemblies', (a) => a.condominiumId === condominiumId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function assembly(id: ID): Assembly | undefined {
  return byId('assemblies', id);
}

export function hasVoted(assemblyId: ID, agendaItemId: ID, unitId: ID): boolean {
  const target = assembly(assemblyId);
  const item = target?.agenda.find((a) => a.id === agendaItemId);
  return !!item?.votes.some((v) => v.unitId === unitId);
}

export class VoteError extends Error {}

export function castVote(assemblyId: ID, agendaItemId: ID, unitId: ID, voterName: string, option: string): Assembly {
  const target = assembly(assemblyId);
  if (!target) throw new VoteError('Assembleia não encontrada.');
  if (target.status !== 'em_votacao') throw new VoteError('Esta assembleia não está em votação.');
  if (hasVoted(assemblyId, agendaItemId, unitId)) throw new VoteError('Esta unidade já registrou voto nesta pauta.');

  const agenda = target.agenda.map((item) =>
    item.id === agendaItemId
      ? { ...item, votes: [...item.votes, { unitId, option, at: new Date().toISOString(), voterName }] }
      : item);

  const next = update('assemblies', assemblyId, { agenda }) as Assembly;

  recordAudit({
    condominiumId: target.condominiumId,
    actorName: voterName,
    actorRole: 'morador',
    action: 'Registrou voto em assembleia',
    target: target.agenda.find((a) => a.id === agendaItemId)?.title ?? 'Pauta',
    detail: `Voto: ${option}`,
    module: 'Assembleias',
  });

  return next;
}

export function voteTally(item: Assembly['agenda'][number]) {
  const counts = new Map<string, number>();
  item.options.forEach((o) => counts.set(o, 0));
  item.votes.forEach((v) => counts.set(v.option, (counts.get(v.option) ?? 0) + 1));
  const total = item.votes.length;
  return item.options.map((option) => ({
    option,
    count: counts.get(option) ?? 0,
    percent: total ? ((counts.get(option) ?? 0) / total) * 100 : 0,
  }));
}

export const ASSEMBLY_STATUS_LABEL: Record<Assembly['status'], string> = {
  agendada: 'Agendada',
  em_votacao: 'Votação aberta',
  encerrada: 'Encerrada',
};
