import type { BuscaDeGrupo } from '@norty-desk/shared';

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

/**
 * Outro servidor do **mesmo** diretório, para o login não cair com um
 * controlador de domínio.
 *
 * Só endereço: base, conta de serviço, filtros e campos continuam na
 * fonte. `lastUsedAt` é quando esta réplica atendeu pela última vez — é
 * o que diz quem está realmente carregando o login.
 */
export type Replica = {
  id: string;
  host: string;
  port: number;
  position: number;
  isActive: boolean;
  lastUsedAt: string | null;
};

export type DadosDaReplica = {
  host: string;
  port?: number;
  position?: number;
  isActive?: boolean;
};

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
  groupSearch: BuscaDeGrupo;
  groupField: string;
  groupMemberField: string;
  groupFilter: string | null;
  groupBaseDn: string | null;
  groupNested: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  userCount: number;
  replicas: Replica[];
};

export type DadosDaFonte = Partial<
  Omit<
    Fonte,
    'id' | 'hasBindPassword' | 'lastTestAt' | 'lastTestOk' | 'lastTestMessage' | 'userCount' | 'replicas'
  >
> & { bindPassword?: string | null };

export type ResultadoDoTeste = {
  ok: boolean;
  mensagem: string;
  /** Qual servidor atendeu. Quando não é o principal, a mensagem já diz. */
  servidor?: { host: string; port: number };
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

/**
 * Um grupo do diretório virando time e papel.
 *
 * Papel e time são os dois opcionais: há mapa que só põe no time (o
 * grupo diz de que área a pessoa é) e mapa que só dá papel (o grupo diz
 * o que ela faz).
 */
export type MapaDeGrupo = {
  id: string;
  group: string;
  teamId: string | null;
  team: { id: string; name: string } | null;
  isTeamManager: boolean;
  role: PapelDoDiretorio | null;
  position: number;
  isActive: boolean;
};

export type DadosDoMapa = {
  group: string;
  teamId?: string | null;
  isTeamManager?: boolean;
  role?: PapelDoDiretorio | null;
  position?: number;
  isActive?: boolean;
};

export const listarMapasDeGrupo = (fonteId: string) =>
  chamar<MapaDeGrupo[]>(`/auth-sources/${fonteId}/grupos`);

export const criarMapaDeGrupo = (fonteId: string, dados: DadosDoMapa) =>
  chamar<MapaDeGrupo[]>(`/auth-sources/${fonteId}/grupos`, { metodo: 'POST', corpo: dados });

export const editarMapaDeGrupo = (fonteId: string, mapaId: string, dados: DadosDoMapa) =>
  chamar<MapaDeGrupo[]>(`/auth-sources/${fonteId}/grupos/${mapaId}`, {
    metodo: 'PATCH',
    corpo: dados,
  });

export const removerMapaDeGrupo = (fonteId: string, mapaId: string) =>
  chamar<MapaDeGrupo[]>(`/auth-sources/${fonteId}/grupos/${mapaId}`, { metodo: 'DELETE' });

export const listarReplicas = (fonteId: string) =>
  chamar<Replica[]>(`/auth-sources/${fonteId}/replicas`);

export const criarReplica = (fonteId: string, dados: DadosDaReplica) =>
  chamar<Replica[]>(`/auth-sources/${fonteId}/replicas`, { metodo: 'POST', corpo: dados });

export const editarReplica = (fonteId: string, replicaId: string, dados: DadosDaReplica) =>
  chamar<Replica[]>(`/auth-sources/${fonteId}/replicas/${replicaId}`, {
    metodo: 'PATCH',
    corpo: dados,
  });

export const removerReplica = (fonteId: string, replicaId: string) =>
  chamar<Replica[]>(`/auth-sources/${fonteId}/replicas/${replicaId}`, { metodo: 'DELETE' });
