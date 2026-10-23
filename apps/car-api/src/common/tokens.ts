import type { ContextKind } from '@nortycar/shared';

/** Token de acesso: 15 min, só em memória no cliente. */
export interface AccessPayload {
  typ: 'access';
  sub: string;
  sid: string;
  kind: ContextKind;
  org?: string;
  mid?: string;
  cid?: string;
  gid?: string;
}

/**
 * Ticket de login: prova que a senha (e, se pedido, o MFA) passou, mas
 * ainda não dá acesso a dado nenhum. Serve só para escolher o contexto.
 */
export interface TicketPayload {
  typ: 'ticket';
  sub: string;
  sid: string;
  /** Falta validar o segundo fator. */
  mfaPending: boolean;
}

export type AnyPayload = AccessPayload | TicketPayload;
