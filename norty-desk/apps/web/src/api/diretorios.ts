import { chamar } from './cliente';

/**
 * Fontes de autenticação (LDAP/AD) da organização.
 *
 * A senha da conta de serviço nunca volta: a tela recebe só
 * `hasBindPassword`. Ao salvar, `bindPassword` ausente mantém a guardada,
 * texto troca, `null` apaga.
 */

export type Seguranca = 'NONE' | 'STARTTLS' | 'LDAPS';
export type PapelDoDiretorio = 'SOLICITANTE' | 'AGENTE' | 'SUPERVISOR';

export type Fonte = {
  id: string;
  name: string;
  isActive: boolean;
  position: number;
  host: string;
  port: number;
  security: Seguranca;
  baseDn: string;
  bindDn: string | null;
  hasBindPassword: boolean;
  loginField: string;
  syncField: string;
  userFilter: string | null;
  emailField: string;
  nameField: string;
  phoneField: string | null;
  timeoutMs: number;
  autoCreate: boolean;
  defaultRole: PapelDoDiretorio;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  userCount: number;
};

export type DadosDaFonte = Partial<
  Omit<Fonte, 'id' | 'hasBindPassword' | 'lastTestAt' | 'lastTestOk' | 'lastTestMessage' | 'userCount'>
> & { bindPassword?: string | null };

export type ResultadoDoTeste = {
  ok: boolean;
  mensagem: string;
  pessoa?: {
    dn: string;
    login: string;
    externalId: string | null;
    email: string | null;
    nome: string | null;
    telefone: string | null;
  };
};

export const listarFontes = () => chamar<Fonte[]>('/auth-sources');

export const criarFonte = (dados: DadosDaFonte) =>
  chamar<Fonte>('/auth-sources', { metodo: 'POST', corpo: dados });

export const editarFonte = (id: string, dados: DadosDaFonte) =>
  chamar<Fonte>(`/auth-sources/${id}`, { metodo: 'PATCH', corpo: dados });

export const desativarFonte = (id: string) =>
  chamar<void>(`/auth-sources/${id}`, { metodo: 'DELETE' });

export const testarFonte = (id: string, login?: string) =>
  chamar<ResultadoDoTeste>(`/auth-sources/${id}/testar`, {
    metodo: 'POST',
    corpo: login ? { login } : {},
  });
