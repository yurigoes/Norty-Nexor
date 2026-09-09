import { chamar } from './cliente';

export type WebhookView = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  hasSecret: boolean;
  deliveryCount: number;
};

export type EntregaView = {
  id: string;
  event: string;
  status: 'PENDENTE' | 'ENVIADO' | 'FALHOU';
  attempts: number;
  responseCode: number | null;
  lastError: string | null;
  scheduledFor: string;
  createdAt: string;
  deliveredAt: string | null;
  payload: unknown;
};

export const listarWebhooks = () => chamar<WebhookView[]>('/webhooks');

export const eventosDeWebhook = () => chamar<string[]>('/webhooks/eventos');

export const criarWebhook = (dados: {
  name: string;
  url: string;
  secret: string;
  events: string[];
}) => chamar<{ id: string }>('/webhooks', { metodo: 'POST', corpo: dados });

export const editarWebhook = (
  id: string,
  dados: { name?: string; url?: string; secret?: string; events?: string[]; isActive?: boolean },
) => chamar<{ ok: true }>(`/webhooks/${id}`, { metodo: 'PATCH', corpo: dados });

export const desativarWebhook = (id: string) =>
  chamar<void>(`/webhooks/${id}`, { metodo: 'DELETE' });

export const entregasDoWebhook = (id: string, status?: string) =>
  chamar<EntregaView[]>(`/webhooks/${id}/entregas${status ? `?status=${status}` : ''}`);

export const testarWebhook = (id: string) =>
  chamar<EntregaView[]>(`/webhooks/${id}/testar`, { metodo: 'POST' });

export const reenviarEntrega = (deliveryId: string) =>
  chamar<EntregaView[]>(`/webhooks/entregas/${deliveryId}/reenviar`, { metodo: 'POST' });
