/**
 * Os eventos que um webhook pode assinar.
 *
 * Lista fechada de propósito: um assinante que digita `ticket.criada` e
 * nunca recebe nada é um chamado de suporte que ninguém consegue
 * diagnosticar. Nome desconhecido é 400 na hora do cadastro.
 */
export const EVENTOS_DE_WEBHOOK = [
  'ticket.criado',
  'ticket.atualizado',
  'ticket.atribuido',
  'ticket.respondido',
  'ticket.resolvido',
  'ticket.fechado',
  'ticket.reaberto',
  'sla.violado',
  'sla.perto-do-vencimento',
  'aprovacao.solicitada',
  'aprovacao.decidida',
  'satisfacao.respondida',
] as const;

export type EventoDeWebhook = (typeof EVENTOS_DE_WEBHOOK)[number];
