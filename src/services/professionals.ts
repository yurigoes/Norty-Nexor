/* =========================================================
   NEXOR — Profissionais recomendados do condomínio
   ---------------------------------------------------------
   Catálogo de prestadores indicados pela administração e pelos
   próprios moradores, com avaliações e pedidos de orçamento.

   Ponto de troca da Fase 2: `createServiceRequest` hoje apenas
   grava o pedido e notifica. Na integração real ele dispara o
   contato com o prestador (WhatsApp/e-mail) e passa a receber
   a resposta por webhook — a assinatura da função não muda.
   ========================================================= */

import { byId, insert, nextId, update, where } from '../data/repositories';
import type {
  ID, Professional, ProfessionalCategory, ProfessionalReview, ServiceRequest,
  ServiceRequestStatus, UserRole,
} from '../data/types';
import { pushNotification } from './notifications';
import { recordAudit } from './audit';

export const CATEGORY_LABEL: Record<ProfessionalCategory, string> = {
  eletrica: 'Elétrica',
  hidraulica: 'Hidráulica',
  reformas: 'Reformas',
  limpeza: 'Limpeza',
  climatizacao: 'Climatização',
  montagem: 'Montagem de móveis',
  chaveiro: 'Chaveiro',
  pintura: 'Pintura',
  tecnologia: 'Tecnologia',
  jardinagem: 'Jardinagem',
  pet: 'Pet',
  aulas: 'Aulas particulares',
  mudancas: 'Mudanças',
  dedetizacao: 'Dedetização',
};

export const CATEGORY_ORDER: ProfessionalCategory[] = [
  'eletrica', 'hidraulica', 'reformas', 'pintura', 'limpeza', 'climatizacao',
  'montagem', 'chaveiro', 'tecnologia', 'jardinagem', 'pet', 'aulas',
  'mudancas', 'dedetizacao',
];

export const REQUEST_STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  enviado: 'Enviado',
  respondido: 'Orçamento recebido',
  contratado: 'Contratado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export function requestTone(status: ServiceRequestStatus) {
  switch (status) {
    case 'enviado': return 'warning' as const;
    case 'respondido': return 'info' as const;
    case 'contratado': return 'brand' as const;
    case 'concluido': return 'success' as const;
    default: return 'neutral' as const;
  }
}

/* ---------------- Consultas ---------------- */

export function professionals(condominiumId: ID): Professional[] {
  return where('professionals', (p) => p.condominiumId === condominiumId && p.active);
}

/** Inclui inativos — usado apenas na gestão do catálogo. */
export function allProfessionals(condominiumId: ID): Professional[] {
  return where('professionals', (p) => p.condominiumId === condominiumId);
}

export function professionalById(id: ID): Professional | undefined {
  return byId('professionals', id);
}

export function recommendedProfessionals(condominiumId: ID, limit = 4): Professional[] {
  return professionals(condominiumId)
    .filter((p) => p.recommendedByCondo)
    .sort((a, b) => b.rating - a.rating || b.jobsInCondo - a.jobsInCondo)
    .slice(0, limit);
}

export function reviewsOf(professionalId: ID): ProfessionalReview[] {
  return where('professionalReviews', (r) => r.professionalId === professionalId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function serviceRequestsOfUnit(unitId: ID): ServiceRequest[] {
  return where('serviceRequests', (r) => r.unitId === unitId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function serviceRequests(condominiumId: ID): ServiceRequest[] {
  return where('serviceRequests', (r) => r.condominiumId === condominiumId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function categoryCounts(condominiumId: ID): Record<ProfessionalCategory, number> {
  const counts = {} as Record<ProfessionalCategory, number>;
  CATEGORY_ORDER.forEach((c) => { counts[c] = 0; });
  professionals(condominiumId).forEach((p) => { counts[p.category] += 1; });
  return counts;
}

export type ProfessionalSort = 'relevancia' | 'nota' | 'trabalhos' | 'preco';

export interface ProfessionalFilter {
  term?: string;
  category?: ProfessionalCategory | '';
  onlyRecommended?: boolean;
  onlyEmergency?: boolean;
  sort?: ProfessionalSort;
}

export function filterProfessionals(condominiumId: ID, filter: ProfessionalFilter): Professional[] {
  const q = (filter.term ?? '').trim().toLowerCase();
  const list = professionals(condominiumId).filter((p) =>
    (!q || [p.name, p.company ?? '', CATEGORY_LABEL[p.category], ...p.specialties]
      .some((f) => f.toLowerCase().includes(q)))
    && (!filter.category || p.category === filter.category)
    && (!filter.onlyRecommended || p.recommendedByCondo)
    && (!filter.onlyEmergency || p.emergency));

  switch (filter.sort) {
    case 'nota':
      return list.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount);
    case 'trabalhos':
      return list.sort((a, b) => b.jobsInCondo - a.jobsInCondo);
    case 'preco':
      return list.sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
    default:
      // Relevância: indicação da administração pesa mais que a nota isolada.
      return list.sort((a, b) =>
        Number(b.recommendedByCondo) - Number(a.recommendedByCondo)
        || Number(b.verified) - Number(a.verified)
        || b.rating - a.rating
        || b.jobsInCondo - a.jobsInCondo);
  }
}

/* ---------------- Escritas ---------------- */

export interface CreateServiceRequestInput {
  condominiumId: ID;
  professionalId: ID;
  unitId: ID;
  residentName: string;
  service: string;
  description: string;
  preferredDate?: string;
}

export function createServiceRequest(input: CreateServiceRequestInput): ServiceRequest {
  const professional = professionalById(input.professionalId);
  const request: ServiceRequest = {
    id: nextId('sreq'),
    condominiumId: input.condominiumId,
    professionalId: input.professionalId,
    unitId: input.unitId,
    residentName: input.residentName,
    service: input.service,
    description: input.description,
    preferredDate: input.preferredDate,
    status: 'enviado',
    createdAt: new Date().toISOString(),
  };
  insert('serviceRequests', request);

  pushNotification({
    condominiumId: input.condominiumId,
    unitId: input.unitId,
    kind: 'servico',
    title: 'Pedido de orçamento enviado',
    body: `${professional?.name ?? 'Profissional'} recebeu seu pedido de "${input.service}" e costuma responder rápido.`,
    link: '/app/profissionais',
    refId: request.id,
  });

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.residentName,
    actorRole: 'morador',
    action: 'Solicitou orçamento',
    target: professional?.name ?? input.professionalId,
    detail: input.service,
    module: 'Profissionais',
  });

  return request;
}

export function updateRequestStatus(id: ID, status: ServiceRequestStatus): ServiceRequest | undefined {
  const request = byId('serviceRequests', id);
  if (!request) return undefined;
  return update('serviceRequests', id, {
    status,
    respondedAt: request.respondedAt ?? (status === 'enviado' ? undefined : new Date().toISOString()),
  });
}

export interface AddReviewInput {
  professionalId: ID;
  condominiumId: ID;
  unitId: ID;
  authorName: string;
  rating: number;
  service: string;
  comment: string;
}

/** Registra a avaliação e recalcula a média do profissional. */
export function addReview(input: AddReviewInput): ProfessionalReview {
  const review: ProfessionalReview = {
    id: nextId('prev'),
    professionalId: input.professionalId,
    condominiumId: input.condominiumId,
    unitId: input.unitId,
    authorName: input.authorName,
    rating: input.rating,
    service: input.service,
    comment: input.comment,
    at: new Date().toISOString(),
  };
  insert('professionalReviews', review);

  const professional = professionalById(input.professionalId);
  if (professional) {
    // A média histórica tem peso proporcional ao total de avaliações já
    // computadas; a nova nota entra como mais um voto nesse conjunto.
    const total = professional.reviewsCount + 1;
    const rating = Math.round(((professional.rating * professional.reviewsCount + input.rating) / total) * 10) / 10;
    update('professionals', professional.id, { rating, reviewsCount: total });
  }

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.authorName,
    actorRole: 'morador',
    action: 'Avaliou profissional',
    target: professional?.name ?? input.professionalId,
    detail: `${input.rating} estrelas · ${input.service}`,
    module: 'Profissionais',
  });

  return review;
}

export interface CreateProfessionalInput {
  condominiumId: ID;
  name: string;
  company?: string;
  category: ProfessionalCategory;
  specialties: string[];
  phone: string;
  email?: string;
  bio: string;
  serviceArea: string;
  priceFrom?: number;
  emergency: boolean;
  recommendedByCondo: boolean;
  actorName: string;
  actorRole: UserRole;
}

export function createProfessional(input: CreateProfessionalInput): Professional {
  const now = new Date().toISOString();
  const professional: Professional = {
    id: nextId('prof'),
    condominiumId: input.condominiumId,
    name: input.name,
    document: '—',
    company: input.company,
    category: input.category,
    specialties: input.specialties,
    phone: input.phone,
    email: input.email,
    bio: input.bio,
    serviceArea: input.serviceArea,
    since: now.slice(0, 10),
    jobsInCondo: 0,
    rating: 0,
    reviewsCount: 0,
    priceFrom: input.priceFrom,
    responseTime: 'Responde no mesmo dia',
    verified: input.recommendedByCondo,
    recommendedByCondo: input.recommendedByCondo,
    recommendedBy: input.recommendedByCondo ? input.actorName : undefined,
    emergency: input.emergency,
    active: true,
    createdAt: now,
  };
  insert('professionals', professional);

  if (input.recommendedByCondo) {
    pushNotification({
      condominiumId: input.condominiumId,
      role: 'morador',
      kind: 'servico',
      title: 'Novo profissional indicado',
      body: `${professional.name} · ${CATEGORY_LABEL[professional.category]} entrou na lista de indicados do condomínio.`,
      link: '/app/profissionais',
      refId: professional.id,
    });
  }

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: 'Cadastrou profissional',
    target: professional.name,
    detail: CATEGORY_LABEL[professional.category],
    module: 'Profissionais',
  });

  return professional;
}

export function toggleRecommendation(id: ID, actorName: string, actorRole: UserRole): Professional | undefined {
  const professional = professionalById(id);
  if (!professional) return undefined;
  const recommendedByCondo = !professional.recommendedByCondo;
  const next = update('professionals', id, {
    recommendedByCondo,
    recommendedBy: recommendedByCondo ? actorName : undefined,
  });

  recordAudit({
    condominiumId: professional.condominiumId,
    actorName,
    actorRole,
    action: recommendedByCondo ? 'Indicou profissional' : 'Removeu indicação',
    target: professional.name,
    detail: CATEGORY_LABEL[professional.category],
    module: 'Profissionais',
  });

  return next;
}
