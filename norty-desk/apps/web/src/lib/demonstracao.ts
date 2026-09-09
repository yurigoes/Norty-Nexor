import type { TicketEventView, TicketListItem } from '@norty-desk/shared';

/**
 * Dados de demonstração do scaffold.
 *
 * Existe para a casca ter o que mostrar antes de a API responder. Some
 * quando o módulo de chamados for ligado à API (Fase 1 do roadmap).
 */

const agora = Date.now();
const emHoras = (h: number) => new Date(agora + h * 3600_000).toISOString();

export const CHAMADOS: TicketListItem[] = [
  {
    id: '1', number: 1042,
    subject: 'Impressora do 3º andar não imprime',
    type: 'INCIDENTE', status: 'ATRIBUIDO',
    urgency: 4, impact: 3, priority: 4,
    originChannel: 'WHATSAPP',
    category: { id: 'c1', name: 'Hardware > Impressora' },
    requester: { kind: 'CONTACT', id: 'k1', name: 'Marina Alves', phone: '+5511999990001' },
    assignedTeam: { kind: 'TEAM', id: 't1', name: 'Suporte N1' },
    assignedUser: null,
    commitments: [{
      kind: 'SLA', target: 'TTR', dueAt: emHoras(0.6),
      achievedAt: null, breachedAt: null, remainingSeconds: 2160,
    }],
    createdAt: emHoras(-5), updatedAt: emHoras(-0.5),
  },
  {
    id: '2', number: 1051,
    subject: 'Acesso ao sistema de ponto bloqueado',
    type: 'REQUISICAO', status: 'NOVO',
    urgency: 3, impact: 2, priority: 2,
    originChannel: 'EMAIL',
    category: { id: 'c2', name: 'Acesso > Conta' },
    requester: { kind: 'USER', id: 'u9', name: 'Rafael Nunes', email: 'rafael@cliente.com.br' },
    assignedTeam: null, assignedUser: null,
    commitments: [{
      kind: 'SLA', target: 'TTO', dueAt: emHoras(1.8),
      achievedAt: null, breachedAt: null, remainingSeconds: 6480,
    }],
    createdAt: emHoras(-0.2), updatedAt: emHoras(-0.2),
  },
  {
    id: '3', number: 1038,
    subject: 'Lote noturno abortou no passo 3',
    type: 'INCIDENTE', status: 'PENDENTE',
    urgency: 5, impact: 5, priority: 5,
    originChannel: 'API',
    category: { id: 'c3', name: 'Sistemas > Integração' },
    requester: { kind: 'CONTACT', id: 'k2', name: 'Monitoramento' },
    assignedTeam: { kind: 'TEAM', id: 't2', name: 'Sustentação' },
    assignedUser: { kind: 'USER', id: 'u3', name: 'Camila Duarte' },
    commitments: [{
      kind: 'SLA', target: 'TTR', dueAt: emHoras(-0.7),
      achievedAt: null, breachedAt: emHoras(-0.7), remainingSeconds: -2520,
    }],
    createdAt: emHoras(-26), updatedAt: emHoras(-3),
  },
];

export const EVENTOS: TicketEventView[] = [
  {
    id: 'e1', type: 'MENSAGEM', visibility: 'PUBLICA', channel: 'WHATSAPP',
    author: { kind: 'CONTACT', id: 'k1', name: 'Marina Alves' },
    body: 'Bom dia! A impressora do 3º andar está com a luz laranja piscando desde ontem.',
    payload: null, attachments: [], createdAt: emHoras(-5), editedAt: null,
  },
  {
    id: 'e2', type: 'ANEXO', visibility: 'PUBLICA', channel: 'WHATSAPP',
    author: { kind: 'CONTACT', id: 'k1', name: 'Marina Alves' },
    body: 'Foto do painel',
    payload: null,
    attachments: [{
      id: 'a1', filename: 'painel.jpg', contentType: 'image/jpeg',
      sizeBytes: 184320, checksum: 'sha256:abc', eventId: 'e2', createdAt: emHoras(-5),
    }],
    createdAt: emHoras(-4.9), editedAt: null,
  },
  {
    id: 'e3', type: 'NOTA_INTERNA', visibility: 'INTERNA', channel: 'WEB',
    author: { kind: 'USER', id: 'u1', name: 'Diego Prado' },
    body: 'Pelo código no painel é o fusor. Já temos um de reposição no estoque.',
    payload: null, attachments: [], createdAt: emHoras(-4), editedAt: null,
  },
  {
    id: 'e4', type: 'MUDANCA_STATUS', visibility: 'PUBLICA', channel: 'SISTEMA',
    author: null, body: null,
    payload: { type: 'MUDANCA_STATUS', from: 'NOVO', to: 'ATRIBUIDO' },
    attachments: [], createdAt: emHoras(-4), editedAt: null,
  },
  {
    id: 'e5', type: 'MENSAGEM', visibility: 'PUBLICA', channel: 'WHATSAPP',
    author: { kind: 'USER', id: 'u1', name: 'Diego Prado' },
    body: 'Marina, identificamos a peça. A troca está agendada para hoje às 15h.',
    payload: null, attachments: [], createdAt: emHoras(-3.5), editedAt: null,
  },
];
