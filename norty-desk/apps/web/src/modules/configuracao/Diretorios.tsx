import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ErroDaApi } from '../../api/cliente';
import type { BuscaDeGrupo, TimeView } from '@norty-desk/shared';
import { BUSCAS_DE_GRUPO, ROTULO_BUSCA_DE_GRUPO } from '@norty-desk/shared';

import {
  criarFonte,
  criarMapaDeGrupo,
  desativarFonte,
  editarFonte,
  editarMapaDeGrupo,
  listarFontes,
  listarMapasDeGrupo,
  removerMapaDeGrupo,
  testarFonte,
  type DadosDaFonte,
  type Fonte,
  type MapaDeGrupo,
  type PapelDoDiretorio,
  type ResultadoDoTeste,
  type Seguranca,
} from '../../api/diretorios';
import * as api from '../../api/endpoints';
import { useAutenticacao } from '../../auth/Autenticacao';

type Edicao = {
  id: string | null;
  name: string;
  host: string;
  port: string;
  security: Seguranca;
  baseDn: string;
  bindDn: string;
  /** Vazio na edição = manter a senha guardada. */
  bindPassword: string;
  apagarSenha: boolean;
  hasBindPassword: boolean;
  loginField: string;
  syncField: string;
  userFilter: string;
  emailField: string;
  nameField: string;
  phoneField: string;
  timeoutMs: string;
  autoCreate: boolean;
  defaultRole: PapelDoDiretorio;
  groupSearch: BuscaDeGrupo;
  groupField: string;
  groupMemberField: string;
  groupFilter: string;
  groupBaseDn: string;
  groupNested: boolean;
  position: string;
  isActive: boolean;
};

/** Os dois diretórios que aparecem na prática, com os campos que cada um usa. */
const MODELOS: Record<'ad' | 'openldap', Partial<Edicao>> = {
  ad: {
    port: '389',
    security: 'STARTTLS',
    loginField: 'sAMAccountName',
    syncField: 'objectGUID',
    // Só pessoas, e só contas habilitadas (bit 2 do userAccountControl).
    userFilter: '(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))',
    emailField: 'mail',
    nameField: 'displayName',
    phoneField: 'telephoneNumber',
  },
  openldap: {
    port: '389',
    security: 'STARTTLS',
    loginField: 'uid',
    syncField: 'entryUUID',
    userFilter: '(objectClass=inetOrgPerson)',
    emailField: 'mail',
    nameField: 'cn',
    phoneField: 'telephoneNumber',
  },
};

const NOVA: Edicao = {
  id: null,
  name: '',
  host: '',
  port: '389',
  security: 'STARTTLS',
  baseDn: '',
  bindDn: '',
  bindPassword: '',
  apagarSenha: false,
  hasBindPassword: false,
  loginField: 'sAMAccountName',
  syncField: 'objectGUID',
  userFilter: MODELOS.ad.userFilter!,
  emailField: 'mail',
  nameField: 'displayName',
  phoneField: 'telephoneNumber',
  timeoutMs: '5000',
  autoCreate: true,
  defaultRole: 'SOLICITANTE',
  groupSearch: 'ATRIBUTO',
  groupField: 'memberOf',
  groupMemberField: 'member',
  groupFilter: '(objectClass=group)',
  groupBaseDn: '',
  groupNested: false,
  position: '0',
  isActive: true,
};

const PAPEIS: { valor: PapelDoDiretorio; rotulo: string }[] = [
  { valor: 'SOLICITANTE', rotulo: 'Solicitante' },
  { valor: 'AGENTE', rotulo: 'Agente' },
  { valor: 'SUPERVISOR', rotulo: 'Supervisor' },
];

const ROTULO_SEGURANCA: Record<Seguranca, string> = {
  STARTTLS: 'StartTLS (porta 389)',
  LDAPS: 'LDAPS (porta 636)',
  NONE: 'Sem criptografia',
};

function paraEdicao(f: Fonte): Edicao {
  return {
    id: f.id,
    name: f.name,
    host: f.host,
    port: String(f.port),
    security: f.security,
    baseDn: f.baseDn,
    bindDn: f.bindDn ?? '',
    bindPassword: '',
    apagarSenha: false,
    hasBindPassword: f.hasBindPassword,
    loginField: f.loginField,
    syncField: f.syncField,
    userFilter: f.userFilter ?? '',
    emailField: f.emailField,
    nameField: f.nameField,
    phoneField: f.phoneField ?? '',
    timeoutMs: String(f.timeoutMs),
    autoCreate: f.autoCreate,
    defaultRole: f.defaultRole,
    groupSearch: f.groupSearch,
    groupField: f.groupField,
    groupMemberField: f.groupMemberField,
    groupFilter: f.groupFilter ?? '',
    groupBaseDn: f.groupBaseDn ?? '',
    groupNested: f.groupNested,
    position: String(f.position),
    isActive: f.isActive,
  };
}

function paraApi(e: Edicao): DadosDaFonte {
  const senha: Pick<DadosDaFonte, 'bindPassword'> = e.apagarSenha
    ? { bindPassword: null }
    : e.bindPassword
      ? { bindPassword: e.bindPassword }
      : {};
  return {
    name: e.name.trim(),
    host: e.host.trim(),
    port: Number(e.port) || 389,
    security: e.security,
    baseDn: e.baseDn.trim(),
    bindDn: e.bindDn.trim() || null,
    loginField: e.loginField.trim(),
    syncField: e.syncField.trim(),
    userFilter: e.userFilter.trim() || null,
    emailField: e.emailField.trim(),
    nameField: e.nameField.trim(),
    phoneField: e.phoneField.trim() || null,
    timeoutMs: Number(e.timeoutMs) || 5000,
    autoCreate: e.autoCreate,
    defaultRole: e.defaultRole,
    groupSearch: e.groupSearch,
    groupField: e.groupField.trim() || 'memberOf',
    groupMemberField: e.groupMemberField.trim() || 'member',
    groupFilter: e.groupFilter.trim() || null,
    groupBaseDn: e.groupBaseDn.trim() || null,
    groupNested: e.groupNested,
    position: Number(e.position) || 0,
    isActive: e.isActive,
    ...senha,
  };
}

function Campo(props: { id: string; rotulo: string; dica?: ReactNode; children: ReactNode }) {
  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={props.id}>
        {props.rotulo}
      </label>
      {props.children}
      {props.dica ? (
        <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
          {props.dica}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Autenticação pelo diretório da empresa (LDAP/AD) — o "Autenticação
 * LDAP" do GLPI, uma lista por organização (docs/13).
 *
 * Quem entra pela primeira vez com o login do AD e o nome da empresa é
 * criado na hora, com o perfil escolhido aqui; daí em diante a senha é
 * sempre conferida no diretório, e nome, e-mail e telefone vêm de lá.
 */
export function Diretorios() {
  const { perfil } = useAutenticacao();
  const [fontes, setFontes] = useState<Fonte[] | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [loginDeTeste, setLoginDeTeste] = useState<Record<string, string>>({});
  const [testes, setTestes] = useState<Record<string, ResultadoDoTeste | 'testando'>>({});

  const recarregar = useCallback(async () => setFontes(await listarFontes()), []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar as fontes de autenticação.'));
  }, [recarregar]);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!edicao) return;
    setErro(null);
    setEnviando(true);
    try {
      const dados = paraApi(edicao);
      const salva = edicao.id ? await editarFonte(edicao.id, dados) : await criarFonte(dados);
      setEdicao(null);
      await recarregar();
      // Salvou, testa: é o que o administrador faria em seguida.
      await testar(salva.id);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setEnviando(false);
    }
  }

  async function testar(id: string) {
    setTestes((t) => ({ ...t, [id]: 'testando' }));
    try {
      const resultado = await testarFonte(id, loginDeTeste[id]?.trim() || undefined);
      setTestes((t) => ({ ...t, [id]: resultado }));
      await recarregar();
    } catch (e) {
      setTestes((t) => ({
        ...t,
        [id]: { ok: false, mensagem: e instanceof ErroDaApi ? e.message : 'O teste não respondeu.' },
      }));
    }
  }

  async function desativar(fonte: Fonte) {
    if (!window.confirm(`Desativar "${fonte.name}"? Quem entra por ela deixa de conseguir entrar.`)) return;
    try {
      await desativarFonte(fonte.id);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível desativar.');
    }
  }

  const aplicarModelo = (modelo: keyof typeof MODELOS) =>
    edicao && setEdicao({ ...edicao, ...MODELOS[modelo] });

  const muda = (campo: keyof Edicao) => (e: { target: { value: string } }) =>
    edicao && setEdicao({ ...edicao, [campo]: e.target.value });

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Autenticação (LDAP / AD)</h2>
          <p>
            Deixe as pessoas entrarem com o login e a senha do diretório da empresa. Na tela de
            entrada, elas digitam o usuário do AD e a empresa <code>{perfil?.organization.slug}</code>.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => { setErro(null); setEdicao(NOVA); }}>
          Nova fonte
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro" role="alert">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {edicao ? (
        <form className="pilha-sm" onSubmit={salvar} noValidate>
          <h3>{edicao.id ? `Editar ${edicao.name}` : 'Nova fonte de autenticação'}</h3>

          {edicao.id ? null : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="suave">Preencher para:</span>
              <button type="button" className="btn -fantasma -sm" onClick={() => aplicarModelo('ad')}>
                Active Directory
              </button>
              <button type="button" className="btn -fantasma -sm" onClick={() => aplicarModelo('openldap')}>
                OpenLDAP
              </button>
            </div>
          )}

          <Campo id="fonte-nome" rotulo="Nome">
            <input id="fonte-nome" className="input" required value={edicao.name} onChange={muda('name')} placeholder="AD da matriz" />
          </Campo>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr) minmax(0, 2fr)', gap: 12 }}>
            <Campo id="fonte-host" rotulo="Servidor">
              <input id="fonte-host" className="input" required value={edicao.host} onChange={muda('host')} placeholder="dc01.empresa.local" />
            </Campo>
            <Campo id="fonte-porta" rotulo="Porta">
              <input id="fonte-porta" className="input" inputMode="numeric" value={edicao.port} onChange={muda('port')} />
            </Campo>
            <Campo id="fonte-seguranca" rotulo="Conexão">
              <select
                id="fonte-seguranca"
                className="input"
                value={edicao.security}
                onChange={(e) => {
                  const security = e.target.value as Seguranca;
                  // Troca a porta junto só se ela ainda é a padrão da opção anterior.
                  const padrao = edicao.port === '389' || edicao.port === '636';
                  setEdicao({ ...edicao, security, port: padrao ? (security === 'LDAPS' ? '636' : '389') : edicao.port });
                }}
              >
                {(Object.keys(ROTULO_SEGURANCA) as Seguranca[]).map((s) => (
                  <option key={s} value={s}>{ROTULO_SEGURANCA[s]}</option>
                ))}
              </select>
            </Campo>
          </div>
          {edicao.security === 'NONE' ? (
            <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
              Sem criptografia, a senha de quem entra atravessa a rede em texto claro. Use só em rede de laboratório.
            </span>
          ) : null}

          <Campo id="fonte-base" rotulo="Base DN" dica="Onde procurar as pessoas. Ex.: OU=Pessoas,DC=empresa,DC=local">
            <input id="fonte-base" className="input" required value={edicao.baseDn} onChange={muda('baseDn')} />
          </Campo>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <Campo id="fonte-bind" rotulo="Conta de serviço (DN)" dica="Vazio = busca anônima.">
              <input id="fonte-bind" className="input" value={edicao.bindDn} onChange={muda('bindDn')} placeholder="CN=svc-desk,OU=Servicos,DC=empresa,DC=local" />
            </Campo>
            <Campo
              id="fonte-senha"
              rotulo="Senha da conta de serviço"
              dica={
                edicao.hasBindPassword ? (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={edicao.apagarSenha} onChange={(e) => setEdicao({ ...edicao, apagarSenha: e.target.checked, bindPassword: '' })} />
                    Apagar a senha guardada
                  </label>
                ) : (
                  'Guardada cifrada; nunca é mostrada de volta.'
                )
              }
            >
              <input
                id="fonte-senha"
                className="input"
                type="password"
                autoComplete="new-password"
                disabled={edicao.apagarSenha}
                value={edicao.bindPassword}
                onChange={muda('bindPassword')}
                placeholder={edicao.hasBindPassword ? 'Guardada — deixe em branco para manter' : ''}
              />
            </Campo>
          </div>

          <details>
            <summary style={{ cursor: 'pointer' }}>Campos do diretório</summary>
            <div className="pilha-sm" style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Campo id="fonte-login" rotulo="Login" dica="O que a pessoa digita.">
                  <input id="fonte-login" className="input" value={edicao.loginField} onChange={muda('loginField')} />
                </Campo>
                <Campo id="fonte-sync" rotulo="Identificador estável" dica="Não muda se o login mudar.">
                  <input id="fonte-sync" className="input" value={edicao.syncField} onChange={muda('syncField')} />
                </Campo>
                <Campo id="fonte-email" rotulo="E-mail">
                  <input id="fonte-email" className="input" value={edicao.emailField} onChange={muda('emailField')} />
                </Campo>
                <Campo id="fonte-nome-campo" rotulo="Nome">
                  <input id="fonte-nome-campo" className="input" value={edicao.nameField} onChange={muda('nameField')} />
                </Campo>
                <Campo id="fonte-telefone" rotulo="Telefone" dica="Vazio = não sincroniza.">
                  <input id="fonte-telefone" className="input" value={edicao.phoneField} onChange={muda('phoneField')} />
                </Campo>
              </div>
              <Campo id="fonte-filtro" rotulo="Filtro extra" dica="Combinado com o login num (& …). Ex.: só um grupo com (memberOf=CN=Desk,OU=Grupos,DC=empresa,DC=local).">
                <input id="fonte-filtro" className="input" value={edicao.userFilter} onChange={muda('userFilter')} spellCheck={false} />
              </Campo>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Campo id="fonte-timeout" rotulo="Tempo limite (ms)">
                  <input id="fonte-timeout" className="input" inputMode="numeric" value={edicao.timeoutMs} onChange={muda('timeoutMs')} />
                </Campo>
                <Campo id="fonte-ordem" rotulo="Ordem" dica="Com mais de uma fonte, a menor é tentada primeiro.">
                  <input id="fonte-ordem" className="input" inputMode="numeric" value={edicao.position} onChange={muda('position')} />
                </Campo>
              </div>
            </div>
          </details>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={edicao.autoCreate} onChange={(e) => setEdicao({ ...edicao, autoCreate: e.target.checked })} />
            Criar a pessoa no primeiro acesso
          </label>
          {edicao.autoCreate ? (
            <Campo id="fonte-papel" rotulo="Perfil de quem é criado" dica="Gestor e administrador só por um administrador, em Pessoas.">
              <select id="fonte-papel" className="input" value={edicao.defaultRole} onChange={(e) => setEdicao({ ...edicao, defaultRole: e.target.value as PapelDoDiretorio })}>
                {PAPEIS.map((p) => (
                  <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                ))}
              </select>
            </Campo>
          ) : null}
          <details>
            <summary>Grupos</summary>
            <div className="pilha-sm" style={{ paddingTop: 12 }}>
              <span className="campo-ajuda">
                Como descobrir a que grupos a pessoa pertence. O que cada grupo concede é
                configurado abaixo, na própria fonte, depois de salvar.
              </span>
              <Campo
                id="fonte-busca-grupo"
                rotulo="Onde procurar"
                dica="No AD o memberOf da pessoa resolve e não custa busca a mais."
              >
                <select
                  id="fonte-busca-grupo"
                  className="input"
                  value={edicao.groupSearch}
                  onChange={(e) => setEdicao({ ...edicao, groupSearch: e.target.value as BuscaDeGrupo })}
                >
                  {BUSCAS_DE_GRUPO.map((b) => (
                    <option key={b} value={b}>
                      {ROTULO_BUSCA_DE_GRUPO[b]}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="grade-2">
                {edicao.groupSearch === 'OBJETO' ? null : (
                  <Campo id="fonte-campo-grupo" rotulo="Atributo da pessoa">
                    <input id="fonte-campo-grupo" className="input" value={edicao.groupField} onChange={muda('groupField')} />
                  </Campo>
                )}
                {edicao.groupSearch === 'ATRIBUTO' ? null : (
                  <>
                    <Campo id="fonte-campo-membro" rotulo="Atributo do grupo">
                      <input id="fonte-campo-membro" className="input" value={edicao.groupMemberField} onChange={muda('groupMemberField')} />
                    </Campo>
                    <Campo id="fonte-filtro-grupo" rotulo="Filtro dos grupos">
                      <input id="fonte-filtro-grupo" className="input" value={edicao.groupFilter} onChange={muda('groupFilter')} />
                    </Campo>
                    <Campo id="fonte-base-grupo" rotulo="Base dos grupos" dica="Vazio usa a base da fonte.">
                      <input id="fonte-base-grupo" className="input" value={edicao.groupBaseDn} onChange={muda('groupBaseDn')} />
                    </Campo>
                  </>
                )}
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={edicao.groupNested}
                  onChange={(e) => setEdicao({ ...edicao, groupNested: e.target.checked })}
                />
                Seguir grupo dentro de grupo
              </label>
              <span className="campo-ajuda">
                Só no Active Directory: usa uma regra de correspondência da Microsoft. Num
                OpenLDAP a busca volta vazia. Sem ela, quem está em &quot;TI-N2&quot; não aparece
                em &quot;TI&quot; mesmo que o segundo contenha o primeiro.
              </span>
            </div>
          </details>

          {edicao.id ? (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={edicao.isActive} onChange={(e) => setEdicao({ ...edicao, isActive: e.target.checked })} />
              Ativa
            </label>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Salvar e testar'}
            </button>
            <button type="button" className="btn -fantasma" onClick={() => setEdicao(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {!fontes ? (
        <div className="sk sk-bloco" />
      ) : fontes.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum diretório ligado</h3>
          <p>Por enquanto, todo mundo entra com e-mail ou usuário e a senha do Desk.</p>
        </div>
      ) : (
        fontes.map((f) => {
          const teste = testes[f.id];
          const ultimo =
            teste && teste !== 'testando'
              ? teste
              : f.lastTestAt
                ? { ok: Boolean(f.lastTestOk), mensagem: f.lastTestMessage ?? '' }
                : null;
          return (
            <div key={f.id} className="pilha-sm" style={{ border: '1px solid var(--borda, #ddd)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0 }}>
                    {f.name}{' '}
                    <span className={`selo ${f.isActive ? '-sucesso' : '-neutro'}`}>{f.isActive ? 'Ativa' : 'Inativa'}</span>
                  </h3>
                  <span className="suave">
                    {f.security === 'LDAPS' ? 'ldaps' : 'ldap'}://{f.host}:{f.port} · {f.baseDn} · login por {f.loginField} ·{' '}
                    {f.userCount} pessoa(s)
                    {f.autoCreate ? ` · cria como ${PAPEIS.find((p) => p.valor === f.defaultRole)?.rotulo ?? f.defaultRole}` : ' · não cria contas'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn -fantasma -sm" onClick={() => { setErro(null); setEdicao(paraEdicao(f)); }}>
                    Editar
                  </button>
                  {f.isActive ? (
                    <button type="button" className="btn -fantasma -sm" onClick={() => void desativar(f)}>
                      Desativar
                    </button>
                  ) : null}
                </div>
              </div>

              <MapaDeGrupos fonte={f} />

              <form
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void testar(f.id);
                }}
              >
                <input
                  className="input"
                  style={{ maxWidth: 260 }}
                  placeholder="Login para procurar (opcional)"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={loginDeTeste[f.id] ?? ''}
                  onChange={(e) => setLoginDeTeste((l) => ({ ...l, [f.id]: e.target.value }))}
                />
                <button type="submit" className="btn -sm" disabled={teste === 'testando'}>
                  {teste === 'testando' ? 'Testando…' : 'Testar'}
                </button>
              </form>

              {ultimo ? (
                <div className={`alerta-bloco ${ultimo.ok ? '' : '-erro'}`} role="status">
                  <span aria-hidden="true">{ultimo.ok ? '✓' : '!'}</span>
                  <span>
                    {ultimo.mensagem}
                    {teste && teste !== 'testando' && teste.pessoa ? (
                      <>
                        <br />
                        {teste.pessoa.nome ?? '(sem nome)'} · {teste.pessoa.email ?? 'sem e-mail'} · login{' '}
                        <code>{teste.pessoa.login}</code>
                      </>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

/**
 * O que cada grupo do diretório concede.
 *
 * Fica dentro da ficha da fonte porque o grupo é dela: o mesmo nome em
 * dois ADs é dois grupos, e um mapa que valesse para todas as fontes
 * daria acesso de um cliente pelo diretório de outro.
 *
 * Time e papel são os dois opcionais. Há mapa que só põe no time — o
 * grupo diz de que área a pessoa é — e mapa que só dá papel, que diz o
 * que ela faz.
 */
function MapaDeGrupos({ fonte }: { fonte: Fonte }) {
  const [mapas, setMapas] = useState<MapaDeGrupo[] | null>(null);
  const [times, setTimes] = useState<TimeView[]>([]);
  const [emEdicao, setEmEdicao] = useState<MapaDeGrupo | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [grupo, setGrupo] = useState('');
  const [teamId, setTeamId] = useState('');
  const [gerente, setGerente] = useState(false);
  const [papel, setPapel] = useState<PapelDoDiretorio | ''>('');

  useEffect(() => {
    void listarMapasDeGrupo(fonte.id)
      .then(setMapas)
      .catch(() => setMapas([]));
    void api
      .listarTimes()
      .then(setTimes)
      .catch(() => undefined);
  }, [fonte.id]);

  function abrir(mapa: MapaDeGrupo | 'novo') {
    setErro(null);
    setEmEdicao(mapa);
    setGrupo(mapa === 'novo' ? '' : mapa.group);
    setTeamId(mapa === 'novo' ? '' : (mapa.teamId ?? ''));
    setGerente(mapa === 'novo' ? false : mapa.isTeamManager);
    setPapel(mapa === 'novo' ? '' : (mapa.role ?? ''));
  }

  const falhar = (e: unknown) =>
    setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar o mapa.');

  if (!mapas) return <div className="sk sk-linha" />;

  return (
    <div className="pilha-sm">
      <div className="linha-entre">
        <span className="campo-ajuda">
          {mapas.length === 0
            ? 'Nenhum grupo mapeado: o diretório não mexe em time nem perfil nesta fonte.'
            : `${mapas.length} grupo(s) mapeado(s). Vale a cada login.`}
        </span>
        <button type="button" className="btn -fantasma -sm" onClick={() => abrir('novo')}>
          Mapear grupo
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {mapas.length > 0 ? (
        <table className="tabela -densa">
          <thead>
            <tr>
              <th>Grupo</th>
              <th>Entra no time</th>
              <th>Perfil</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mapas.map((m) => (
              <tr key={m.id}>
                <td className="mono">
                  {m.group}
                  {m.isActive ? null : <span className="selo -neutro"> desligado</span>}
                </td>
                <td>
                  {m.team?.name ?? '—'}
                  {m.team && m.isTeamManager ? ' (como gerente)' : ''}
                </td>
                <td>{PAPEIS.find((p) => p.valor === m.role)?.rotulo ?? '—'}</td>
                <td className="-num">
                  <button type="button" className="btn -fantasma -sm" onClick={() => abrir(m)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn -perigo -sm"
                    onClick={() => {
                      setErro(null);
                      void removerMapaDeGrupo(fonte.id, m.id).then(setMapas).catch(falhar);
                    }}
                  >
                    Apagar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {emEdicao ? (
        <form
          className="pilha-sm"
          style={{ border: '1px solid var(--borda, #ddd)', borderRadius: 8, padding: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);

            const dados = {
              group: grupo,
              teamId: teamId || null,
              isTeamManager: gerente,
              role: papel || null,
            };

            const salvar =
              emEdicao === 'novo'
                ? criarMapaDeGrupo(fonte.id, dados)
                : editarMapaDeGrupo(fonte.id, emEdicao.id, dados);

            void salvar
              .then((lista) => {
                setMapas(lista);
                setEmEdicao(null);
              })
              .catch(falhar);
          }}
        >
          <Campo
            id={`mapa-grupo-${fonte.id}`}
            rotulo="Grupo no diretório"
            dica="O nome (TI-Suporte) ou o DN inteiro, quando há grupos de mesmo nome em ramos diferentes. O teste acima lista os grupos de um login."
          >
            <input
              id={`mapa-grupo-${fonte.id}`}
              className="input"
              required
              autoFocus
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              placeholder="TI-Suporte"
            />
          </Campo>

          <div className="grade-2">
            <Campo id={`mapa-time-${fonte.id}`} rotulo="Entra no time">
              <select
                id={`mapa-time-${fonte.id}`}
                className="input"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">Nenhum</option>
                {times.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo
              id={`mapa-papel-${fonte.id}`}
              rotulo="Perfil"
              dica="Com mais de um grupo dando perfil, vale o primeiro da lista."
            >
              <select
                id={`mapa-papel-${fonte.id}`}
                className="input"
                value={papel}
                onChange={(e) => setPapel(e.target.value as PapelDoDiretorio | '')}
              >
                <option value="">Não mexe no perfil</option>
                {PAPEIS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {teamId ? (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={gerente} onChange={(e) => setGerente(e.target.checked)} />
              Entra como gerente do time
            </label>
          ) : null}

          <span className="campo-ajuda">
            Sair do grupo no diretório tira do time e devolve o perfil padrão da fonte, no login
            seguinte. O que alguém atrelou pela tela de times não é mexido.
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario -sm">
              Salvar
            </button>
            <button type="button" className="btn -fantasma -sm" onClick={() => setEmEdicao(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
