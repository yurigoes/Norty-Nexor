import type { PapelUsuario } from '../../gerado/prisma';

/**
 * O que o guard resolve uma vez por requisição e injeta em
 * `request.usuario`. `empresaId` vem daqui e nunca do corpo:
 * aceitar um id vindo do cliente é entregar os dados das outras
 * empresas a quem souber editar um JSON.
 */
export interface UsuarioRequisicao {
  id: string;
  empresaId: string;
  email: string;
  nome: string;
  papel: PapelUsuario;
  sessaoId: string;
}

export interface CargaJwt {
  sub: string;
  emp: string;
  ses: string;
  pap: PapelUsuario;
}

declare module 'express' {
  interface Request {
    usuario?: UsuarioRequisicao;
  }
}
