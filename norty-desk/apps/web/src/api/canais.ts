import { chamar } from './cliente';

/**
 * Canais e diagnóstico.
 *
 * A tela recebe `true`/`false` no lugar de cada segredo — se existe, não
 * qual é (ver `apps/api/src/modules/channels/segredos.ts`). Devolver o
 * booleano ao salvar significa "não mexi nisso", e a API preserva o que
 * já estava lá.
 */

export type TipoDeCanal = 'EMAIL_IMAP' | 'EMAIL_SMTP' | 'EMAIL_WEBHOOK' | 'WHATSAPP_EVOLUTION';

export type CanalView = {
  id: string;
  kind: TipoDeCanal;
  name: string;
  isActive: boolean;
  defaultTeamId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  config: Record<string, unknown>;
};

export type EntradaView = {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'WEB' | 'API' | 'SISTEMA';
  externalId: string;
  fromAddress: string | null;
  subject: string | null;
  receivedAt: string;
  processedAt: string | null;
  discardedReason: string | null;
  ticket: { id: string; number: number } | null;
};

export type EntradaDetalhe = EntradaView & {
  bodyText: string | null;
  bodyHtml: string | null;
  rawHeaders: Record<string, unknown> | null;
  attachments: unknown;
  channelAccountId: string | null;
};

export type SaidaView = {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP';
  toAddress: string;
  subject: string | null;
  status: 'PENDENTE' | 'ENVIADO' | 'FALHOU';
  attempts: number;
  scheduledFor: string;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export const listarCanais = () => chamar<CanalView[]>('/channels/accounts');

export const criarCanal = (dados: {
  kind: TipoDeCanal;
  name: string;
  config: Record<string, unknown>;
  defaultTeamId?: string;
}) => chamar<{ id: string }>('/channels/accounts', { metodo: 'POST', corpo: dados });

export const editarCanal = (
  id: string,
  dados: {
    name?: string;
    config?: Record<string, unknown>;
    defaultTeamId?: string;
    isActive?: boolean;
  },
) => chamar<{ ok: true }>(`/channels/accounts/${id}`, { metodo: 'PATCH', corpo: dados });

export const desativarCanal = (id: string) =>
  chamar<void>(`/channels/accounts/${id}`, { metodo: 'DELETE' });

export const testarCanal = (id: string) =>
  chamar<{ ok: boolean; detalhe: string }>(`/channels/accounts/${id}/testar`, { metodo: 'POST' });

export const coletarAgora = (id: string) =>
  chamar<{ lidas: number; aceitas: number }>(`/channels/accounts/${id}/coletar`, {
    metodo: 'POST',
  });

export const listarEntradas = (filtro?: 'todas' | 'pendentes' | 'descartadas') => {
  const query =
    filtro === 'pendentes'
      ? '?processed=false'
      : filtro === 'descartadas'
        ? '?processed=descartadas'
        : '';
  return chamar<EntradaView[]>(`/channels/inbound${query}`);
};

export const obterEntrada = (id: string) => chamar<EntradaDetalhe>(`/channels/inbound/${id}`);

export const reprocessarEntrada = (id: string) =>
  chamar<EntradaDetalhe>(`/channels/inbound/${id}/reprocessar`, { metodo: 'POST' });

export const listarSaidas = (status?: 'PENDENTE' | 'ENVIADO' | 'FALHOU') =>
  chamar<SaidaView[]>(`/channels/outbound${status ? `?status=${status}` : ''}`);

export const reenviarSaida = (id: string) =>
  chamar<SaidaView>(`/channels/outbound/${id}/reenviar`, { metodo: 'POST' });
