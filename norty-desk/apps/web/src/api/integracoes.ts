import { chamar } from './cliente';


/** Uma chave, como a tela a vê. O hash nunca sai da API. */
export type ChaveView = {
  id: string;
  name: string;
  clientId: string | null;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/**
 * A resposta da criação, e a **única** vez que o valor cru existe.
 *
 * Perdido, não há como recuperá-lo: o banco só guarda o SHA-256. O
 * caminho é revogar e criar outra.
 */
export type ChaveCriada = ChaveView & { chave: string };

export const listarChaves = () => chamar<ChaveView[]>('/api-keys');

export const criarChave = (dados: { name: string; clientId?: string; scopes: string[] }) =>
  chamar<ChaveCriada>('/api-keys', { metodo: 'POST', corpo: dados });

export const revogarChave = (id: string) =>
  chamar<void>(`/api-keys/${id}`, { metodo: 'DELETE' });

