import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ErroDaApi } from '../../api/cliente';
import {
  criarFonte,
  desativarFonte,
  editarFonte,
  listarFontes,
  testarFonte,
  type DadosDaFonte,
  type Fonte,
  type PapelDoDiretorio,
  type ResultadoDoTeste,
  type Seguranca,
} from '../../api/diretorios';
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
