import type { Role } from '@norty-desk/shared';

import { chamar } from './cliente';

/** Pessoa como a listagem de `/users` devolve — sem hash, por projeção explícita. */
export type Pessoa = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  role: Role;
};

export type NovaPessoa = {
  email: string;
  name: string;
  role: Role;
  phone?: string;
  username?: string;
};

/** A senha provisória aparece só aqui, uma vez. `null` quando a pessoa já existia noutra organização. */
export type PessoaCriada = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: Role;
  senhaProvisoria: string | null;
};

export type EdicaoDePessoa = {
  name?: string;
  role?: Role;
  phone?: string;
  isActive?: boolean;
  /** `null` apaga. */
  username?: string | null;
};

export const listarPessoasAdmin = (q?: string) =>
  chamar<Pessoa[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);

export const criarPessoa = (dados: NovaPessoa) =>
  chamar<PessoaCriada>('/users', { metodo: 'POST', corpo: dados });

export const editarPessoa = (id: string, dados: EdicaoDePessoa) =>
  chamar<Pessoa>(`/users/${id}`, { metodo: 'PATCH', corpo: dados });
