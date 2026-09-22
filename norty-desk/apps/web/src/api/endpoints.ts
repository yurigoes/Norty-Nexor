import type {
  AgendarRequest,
  AppointmentView,
  ConcluirOrdemRequest,
  EscreverItemRequest,
  EscreverOrdemRequest,
  ServiceOrderView,
  AttachmentView,
  CreateTicketRequest,
  LoginResponse,
  MeResponse,
  Paginated,
  TicketDetail,
  TicketEventView,
  TicketListItem,
  TicketQuery,
  TimeView,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/**
 * As chamadas da API, tipadas pelos contratos de `packages/shared`.
 *
 * Nenhum componente monta URL: se a rota mudar, muda aqui.
 */

// --- Autenticação -----------------------------------------------------

/**
 * `login` é o e-mail ou o nome de usuário. Com nome de usuário vai também
 * a organização, porque o usuário só é único dentro dela.
 */
export const entrar = (login: string, password: string, organization?: string) =>
  chamar<LoginResponse>('/auth/login', {
    metodo: 'POST',
    corpo: { login, password, ...(organization ? { organization } : {}) },
  });

export const sair = () => chamar<void>('/auth/logout', { metodo: 'POST' });

export const meuPerfil = () => chamar<MeResponse>('/auth/me');

export type AtualizarPerfil = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  username?: string | null;
  /** Obrigatória quando o e-mail ou o usuário mudam. */
  senhaAtual?: string;
};

export const atualizarPerfil = (dados: AtualizarPerfil) =>
  chamar<MeResponse>('/auth/me', { metodo: 'PATCH', corpo: dados });

export const trocarSenha = (atual: string, nova: string) =>
  chamar<void>('/auth/trocar-senha', { metodo: 'POST', corpo: { atual, nova } });

export const trocarOrganizacao = (organizationId: string) =>
  chamar<{ accessToken: string }>('/auth/organizacao-ativa', {
    metodo: 'POST',
    corpo: { organizationId },
  });

// --- Chamados ---------------------------------------------------------

function queryDeFiltro(filtro: TicketQuery & { semAtribuicao?: boolean }): string {
  const parametros = new URLSearchParams();

  for (const [chave, valor] of Object.entries(filtro)) {
    if (valor === undefined || valor === null || valor === '') continue;
    parametros.set(chave, Array.isArray(valor) ? valor.join(',') : String(valor));
  }

  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}

export const listarChamados = (filtro: TicketQuery & { semAtribuicao?: boolean } = {}) =>
  chamar<Paginated<TicketListItem>>(`/tickets${queryDeFiltro(filtro)}`);

export const obterChamado = (id: string) => chamar<TicketDetail>(`/tickets/${id}`);

export const eventosDoChamado = (id: string) =>
  chamar<TicketEventView[]>(`/tickets/${id}/eventos`);

export const abrirChamado = (dados: CreateTicketRequest) =>
  chamar<TicketDetail>('/tickets', { metodo: 'POST', corpo: dados });

export const responder = (
  id: string,
  body: string,
  visibility: 'PUBLICA' | 'INTERNA' = 'PUBLICA',
  channel?: string,
) =>
  chamar<TicketEventView>(`/tickets/${id}/responder`, {
    metodo: 'POST',
    corpo: { body, visibility, ...(channel ? { channel } : {}) },
  });

export const atribuir = (id: string, alvo: { teamId?: string; userId?: string }) =>
  chamar<TicketDetail>(`/tickets/${id}/atribuir`, { metodo: 'POST', corpo: alvo });

export const classificar = (
  id: string,
  dados: { categoryId?: string; urgency?: number; impact?: number },
) => chamar<TicketDetail>(`/tickets/${id}/classificar`, { metodo: 'POST', corpo: dados });

export const resolver = (id: string, body: string) =>
  chamar<TicketDetail>(`/tickets/${id}/resolver`, { metodo: 'POST', corpo: { body } });

export const fechar = (id: string) =>
  chamar<TicketDetail>(`/tickets/${id}/fechar`, { metodo: 'POST' });

export const reabrir = (id: string, body: string) =>
  chamar<TicketDetail>(`/tickets/${id}/reabrir`, { metodo: 'POST', corpo: { body } });

export const pausar = (id: string, pendingReasonId: string) =>
  chamar<TicketDetail>(`/tickets/${id}/pausar`, { metodo: 'POST', corpo: { pendingReasonId } });

export const retomar = (id: string) =>
  chamar<TicketDetail>(`/tickets/${id}/retomar`, { metodo: 'POST' });

// --- Anexos -----------------------------------------------------------

export const anexar = (ticketId: string, arquivo: File) => {
  const forma = new FormData();
  forma.append('file', arquivo);
  return chamar<AttachmentView>(`/tickets/${ticketId}/anexos`, {
    metodo: 'POST',
    corpo: forma,
  });
};

export const urlDoAnexo = (id: string) =>
  `${import.meta.env.VITE_API_URL ?? '/v1'}/anexos/${id}`;

// --- Catálogo ---------------------------------------------------------

export type CategoriaView = {
  id: string;
  name: string;
  ownName: string;
  parentId: string | null;
  isActive: boolean;
  defaultTeam: { id: string; name: string } | null;
  defaultAssignee: { id: string; name: string } | null;
  /** Aparece na tela de abertura sem login. */
  isPublic: boolean;
  /** Exige aval do gestor da empresa. Herda para as filhas. */
  requiresApproval: boolean;
};

export const listarCategorias = () => chamar<CategoriaView[]>('/categories');
export const listarTimes = () => chamar<TimeView[]>('/teams');

// --- Atendimento agendado ---------------------------------------------

export const listarAgendamentos = (ticketId: string) =>
  chamar<AppointmentView[]>(`/tickets/${ticketId}/agendamentos`);

export const marcarAtendimento = (ticketId: string, corpo: AgendarRequest) =>
  chamar<AppointmentView>(`/tickets/${ticketId}/agendamentos`, { metodo: 'POST', corpo });

export const cancelarAtendimento = (id: string, reason?: string) =>
  chamar<AppointmentView>(`/agendamentos/${id}/cancelar`, {
    metodo: 'POST',
    corpo: reason ? { reason } : {},
  });

export const concluirAtendimento = (id: string) =>
  chamar<AppointmentView>(`/agendamentos/${id}/concluir`, { metodo: 'POST', corpo: {} });

// --- Ordem de serviço --------------------------------------------------

export const listarOrdens = (ticketId: string) =>
  chamar<ServiceOrderView[]>(`/tickets/${ticketId}/ordens`);

export const abrirOrdem = (ticketId: string, corpo: EscreverOrdemRequest = {}) =>
  chamar<ServiceOrderView>(`/tickets/${ticketId}/ordens`, { metodo: 'POST', corpo });

export const editarOrdem = (id: string, corpo: EscreverOrdemRequest) =>
  chamar<ServiceOrderView>(`/ordens/${id}`, { metodo: 'PATCH', corpo });

export const incluirItemDaOrdem = (id: string, corpo: EscreverItemRequest) =>
  chamar<ServiceOrderView>(`/ordens/${id}/itens`, { metodo: 'POST', corpo });

export const editarItemDaOrdem = (id: string, itemId: string, corpo: EscreverItemRequest) =>
  chamar<ServiceOrderView>(`/ordens/${id}/itens/${itemId}`, { metodo: 'PATCH', corpo });

export const removerItemDaOrdem = (id: string, itemId: string) =>
  chamar<ServiceOrderView>(`/ordens/${id}/itens/${itemId}`, { metodo: 'DELETE' });

export const concluirOrdem = (id: string, corpo: ConcluirOrdemRequest) =>
  chamar<ServiceOrderView>(`/ordens/${id}/concluir`, { metodo: 'POST', corpo });

export const cancelarOrdem = (id: string) =>
  chamar<ServiceOrderView>(`/ordens/${id}/cancelar`, { metodo: 'POST', corpo: {} });

export const urlDaOrdemEmPdf = (id: string) =>
  `${import.meta.env.VITE_API_URL ?? '/v1'}/ordens/${id}/pdf`;

/** Retirar o anexo. Quem pode o quê é `podeRemoverAnexo`, em shared. */
export const removerAnexo = (id: string) =>
  chamar<void>(`/anexos/${id}`, { metodo: 'DELETE' });
