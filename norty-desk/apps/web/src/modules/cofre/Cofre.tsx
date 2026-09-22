import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ROTULO_DO_SEGREDO,
  TIPOS_DE_SEGREDO,
  type AssetView,
  type ConcessaoView,
  type LeituraDoSegredoView,
  type SegredoView,
  type TipoDeSegredo,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  assumirSegredo,
  compartilharSegredo,
  compartilhamentosDoSegredo,
  cofreDisponivel,
  editarSegredo,
  guardarSegredo,
  leiturasDoSegredo,
  listarSegredos,
  listarTodosOsSegredos,
  removerSegredo,
  revelarSegredo,
  revogarCompartilhamento,
} from '../../api/cofre';
import { buscarAtivos } from '../../api/ativos';
import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

/** Quanto tempo a senha fica na tela depois de revelada. */
const SEGUNDOS_VISIVEL = 30;

type Edicao = {
  id: string | null;
  kind: TipoDeSegredo;
  name: string;
  login: string;
  senha: string;
  url: string;
  assetId: string;
  sistema: string;
  notas: string;
};

const NOVO: Edicao = {
  id: null,
  kind: 'SISTEMA',
  name: '',
  login: '',
  senha: '',
  url: '',
  assetId: '',
  sistema: '',
  notas: '',
};

/**
 * O cofre de senhas.
 *
 * A tela nunca recebe senha: a lista traz nome, login e o que mais
 * identifica o acesso, e a senha só chega quando alguém clica em
 * revelar — o que fica registrado e o dono vê.
 *
 * Revelada, ela some sozinha em trinta segundos. Não é proteção contra
 * quem quer copiá-la (quem quer, copia), é proteção contra o caso que
 * de fato acontece: a senha do cliente aberta na tela quando alguém
 * chega para falar com você, ou quando você compartilha o monitor numa
 * reunião.
 */
export function Cofre() {
  const { perfil, can } = useAutenticacao();

  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  const [segredos, setSegredos] = useState<SegredoView[] | null>(null);
  const [aba, setAba] = useState<'MEUS' | 'TODOS'>('MEUS');
  const [busca, setBusca] = useState('');
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [aberto, setAberto] = useState<{ id: string; senha: string; restam: number } | null>(null);
  const [painel, setPainel] = useState<SegredoView | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeAdministrar = can('cofre:administrar');

  const recarregar = useCallback(async () => {
    setSegredos(aba === 'TODOS' ? await listarTodosOsSegredos() : await listarSegredos());
  }, [aba]);

  useEffect(() => {
    void cofreDisponivel()
      .then((e) => setDisponivel(e.disponivel))
      .catch(() => setDisponivel(false));
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar o cofre.'));
  }, [recarregar]);

  // A contagem regressiva da senha revelada.
  useEffect(() => {
    if (!aberto) return undefined;
    const relogio = setInterval(() => {
      setAberto((atual) => {
        if (!atual) return null;
        return atual.restam <= 1 ? null : { ...atual, restam: atual.restam - 1 };
      });
    }, 1000);
    return () => clearInterval(relogio);
  }, [aberto]);

  if (disponivel === false) {
    return (
      <div className="pilha" style={{ maxWidth: 720 }}>
        <h2 className="titulo-seccao">Cofre de senhas</h2>
        <div className="alerta-bloco -aviso">
          <span aria-hidden="true">!</span>
          <span>
            O cofre não está configurado nesta instalação. Falta a chave{' '}
            <code>VAULT_SECRET_KEY</code> — sem ela não há como cifrar, e guardar senha em texto
            claro não é opção.
          </span>
        </div>
      </div>
    );
  }

  const termo = busca.trim().toLowerCase();
  const lista = (segredos ?? []).filter(
    (s) =>
      !termo ||
      s.name.toLowerCase().includes(termo) ||
      s.login.toLowerCase().includes(termo) ||
      (s.sistema ?? '').toLowerCase().includes(termo) ||
      (s.url ?? '').toLowerCase().includes(termo),
  );

  async function revelar(s: SegredoView) {
    setErro(null);
    try {
      const { senha } = await revelarSegredo(s.id);
      setAberto({ id: s.id, senha, restam: SEGUNDOS_VISIVEL });
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível abrir a senha.');
    }
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!edicao) return;

    setErro(null);
    setOcupado(true);
    try {
      const dados = {
        kind: edicao.kind,
        name: edicao.name.trim(),
        login: edicao.login.trim(),
        // Vazio na edição mantém a guardada — a tela não a mostra, e
        // portanto não tem como reenviá-la.
        ...(edicao.senha ? { senha: edicao.senha } : {}),
        url: edicao.kind === 'SITE' ? edicao.url.trim() : null,
        assetId: edicao.kind === 'COMPUTADOR' ? edicao.assetId || null : null,
        sistema: edicao.kind === 'SISTEMA' ? edicao.sistema.trim() : null,
        notas: edicao.notas.trim() || null,
      };

      if (edicao.id) await editarSegredo(edicao.id, dados);
      else await guardarSegredo(dados);

      setEdicao(null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setOcupado(false);
    }
  }

  async function apagar(s: SegredoView) {
    if (!window.confirm(`Apagar "${s.name}"? A senha guardada se perde.`)) return;
    try {
      await removerSegredo(s.id);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível apagar.');
    }
  }

  async function assumir(s: SegredoView) {
    const confirmou = window.confirm(
      `Assumir "${s.name}", hoje de ${s.owner.name}?\n\n` +
        'Isto fica registrado na auditoria e aparece para o dono atual, que continua com ' +
        'acesso. A senha só é lida depois, e cada leitura também fica registrada.',
    );
    if (!confirmou) return;

    try {
      await assumirSegredo(s.id);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível assumir.');
    }
  }

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Cofre de senhas</h2>
          <p>
            A senha do cliente com dono, prazo e registro de quem abriu — em vez da planilha
            compartilhada de onde ela costuma vir.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => { setErro(null); setEdicao(NOVO); }}>
          Guardar senha
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro" role="alert">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      <div className="linha-entre" style={{ gap: 'var(--e-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn -sm ${aba === 'MEUS' ? '-secundario' : '-fantasma'}`}
            onClick={() => setAba('MEUS')}
          >
            Minhas e compartilhadas
          </button>
          {podeAdministrar ? (
            <button
              type="button"
              className={`btn -sm ${aba === 'TODOS' ? '-secundario' : '-fantasma'}`}
              onClick={() => setAba('TODOS')}
              title="Só o que existe: o cofre da organização, sem as senhas."
            >
              Todas da organização
            </button>
          ) : null}
        </div>

        <input
          className="input -auto"
          type="search"
          placeholder="Nome, login ou sistema"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar no cofre"
        />
      </div>

      {aba === 'TODOS' ? (
        <div className="alerta-bloco -info">
          <span aria-hidden="true">i</span>
          <span>
            Esta lista mostra que o segredo <strong>existe</strong>, não o que ele guarda. Para
            abrir um que não é seu, é preciso assumi-lo — e isso fica na auditoria.
          </span>
        </div>
      ) : null}

      {segredos === null ? <div className="sk sk-bloco" /> : null}

      {segredos !== null && lista.length === 0 ? (
        <p className="suave">
          {termo ? 'Nada com esse termo.' : 'Nenhuma senha guardada ainda.'}
        </p>
      ) : null}

      <div className="pilha-sm">
        {lista.map((s) => (
          <article key={s.id} className="segredo">
            <div className="segredo-topo">
              <div>
                <strong>{s.name}</strong>{' '}
                <span className="selo -neutro">{ROTULO_DO_SEGREDO[s.kind]}</span>
                {s.via === 'COMPARTILHADO' ? (
                  <span className="selo -info" title={`De ${s.owner.name}`}>
                    compartilhada
                  </span>
                ) : null}
                {s.via === 'ADMINISTRACAO' ? (
                  <span className="selo -contorno" title="Você vê porque administra o cofre.">
                    fechada
                  </span>
                ) : null}
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  {s.login}
                  {s.kind === 'SITE' && s.url ? ` · ${s.url}` : ''}
                  {s.kind === 'SISTEMA' && s.sistema ? ` · ${s.sistema}` : ''}
                  {s.kind === 'COMPUTADOR' && s.asset ? ` · ${s.asset.name}` : ''}
                </span>
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  {s.souDono ? 'Sua' : `De ${s.owner.name}`}
                  {s.meuAcessoAte ? ` · seu acesso vai até ${dataCurta(s.meuAcessoAte)}` : ''}
                  {s.souDono && s.compartilhadoCom
                    ? ` · dividida com ${s.compartilhadoCom} pessoa(s)`
                    : ''}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {aba === 'TODOS' && !s.souDono ? (
                  <button type="button" className="btn -secundario -sm" onClick={() => void assumir(s)}>
                    Assumir
                  </button>
                ) : (
                  <button type="button" className="btn -secundario -sm" onClick={() => void revelar(s)}>
                    Revelar
                  </button>
                )}

                {s.souDono ? (
                  <>
                    <button
                      type="button"
                      className="btn -fantasma -sm"
                      onClick={() => setPainel(s)}
                    >
                      Compartilhar
                    </button>
                    <button
                      type="button"
                      className="btn -fantasma -sm"
                      onClick={() =>
                        setEdicao({
                          id: s.id,
                          kind: s.kind,
                          name: s.name,
                          login: s.login,
                          senha: '',
                          url: s.url ?? '',
                          assetId: s.asset?.id ?? '',
                          sistema: s.sistema ?? '',
                          notas: s.notas ?? '',
                        })
                      }
                    >
                      Editar
                    </button>
                    <button type="button" className="btn -fantasma -sm" onClick={() => void apagar(s)}>
                      Apagar
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {aberto?.id === s.id ? (
              <div className="segredo-revelada">
                <code>{aberto.senha}</code>
                <button
                  type="button"
                  className="btn -fantasma -sm"
                  onClick={() => void navigator.clipboard?.writeText(aberto.senha)}
                >
                  Copiar
                </button>
                <span className="campo-ajuda">some em {aberto.restam}s</span>
                <button type="button" className="btn -fantasma -sm" onClick={() => setAberto(null)}>
                  Esconder
                </button>
              </div>
            ) : null}

            {s.notas ? <p className="campo-ajuda">{s.notas}</p> : null}
          </article>
        ))}
      </div>

      {edicao ? (
        <FormaDoSegredo
          edicao={edicao}
          ocupado={ocupado}
          aoMudar={setEdicao}
          aoSalvar={salvar}
          aoFechar={() => setEdicao(null)}
        />
      ) : null}

      {painel ? (
        <PainelDeCompartilhamento
          segredo={painel}
          meuId={perfil?.user.id ?? ''}
          aoFechar={() => {
            setPainel(null);
            void recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------

function FormaDoSegredo({
  edicao,
  ocupado,
  aoMudar,
  aoSalvar,
  aoFechar,
}: {
  edicao: Edicao;
  ocupado: boolean;
  aoMudar: (e: Edicao) => void;
  aoSalvar: (evento: FormEvent) => void;
  aoFechar: () => void;
}) {
  const [ativos, setAtivos] = useState<AssetView[]>([]);

  useEffect(() => {
    if (edicao.kind !== 'COMPUTADOR') return;
    void buscarAtivos({ limit: 200 })
      .then(setAtivos)
      .catch(() => undefined);
  }, [edicao.kind]);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={edicao.id ? 'Editar senha' : 'Guardar senha'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{edicao.id ? 'Editar senha' : 'Guardar senha'}</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form className="modal-forma pilha-sm" onSubmit={aoSalvar} noValidate>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="segredo-tipo">
              A senha é de quê
            </label>
            <select
              id="segredo-tipo"
              className="input"
              value={edicao.kind}
              onChange={(e) => aoMudar({ ...edicao, kind: e.target.value as TipoDeSegredo })}
            >
              {TIPOS_DE_SEGREDO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_DO_SEGREDO[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="segredo-nome">
              Nome
            </label>
            <input
              id="segredo-nome"
              className="input"
              required
              value={edicao.name}
              onChange={(e) => aoMudar({ ...edicao, name: e.target.value })}
              placeholder="Painel do cliente Acme"
            />
          </div>

          {edicao.kind === 'SITE' ? (
            <div className="campo">
              <label className="campo-rotulo" htmlFor="segredo-url">
                Endereço
              </label>
              <input
                id="segredo-url"
                className="input"
                value={edicao.url}
                onChange={(e) => aoMudar({ ...edicao, url: e.target.value })}
                placeholder="https://painel.acme.com.br"
              />
            </div>
          ) : null}

          {edicao.kind === 'COMPUTADOR' ? (
            <div className="campo">
              <label className="campo-rotulo" htmlFor="segredo-ativo">
                Equipamento
              </label>
              <select
                id="segredo-ativo"
                className="input"
                value={edicao.assetId}
                onChange={(e) => aoMudar({ ...edicao, assetId: e.target.value })}
              >
                <option value="">Escolha o equipamento</option>
                {ativos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {edicao.kind === 'SISTEMA' ? (
            <div className="campo">
              <label className="campo-rotulo" htmlFor="segredo-sistema">
                Qual sistema
              </label>
              <input
                id="segredo-sistema"
                className="input"
                value={edicao.sistema}
                onChange={(e) => aoMudar({ ...edicao, sistema: e.target.value })}
                placeholder="ERP, firewall, roteador…"
              />
            </div>
          ) : null}

          <div className="campo">
            <label className="campo-rotulo" htmlFor="segredo-login">
              Login
            </label>
            <input
              id="segredo-login"
              className="input"
              required
              autoComplete="off"
              value={edicao.login}
              onChange={(e) => aoMudar({ ...edicao, login: e.target.value })}
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="segredo-senha">
              Senha
            </label>
            <input
              id="segredo-senha"
              className="input"
              type="password"
              autoComplete="new-password"
              value={edicao.senha}
              onChange={(e) => aoMudar({ ...edicao, senha: e.target.value })}
              placeholder={edicao.id ? 'Em branco mantém a guardada' : ''}
            />
            <span className="campo-ajuda">
              {edicao.id
                ? 'Deixe em branco para manter a senha que já está guardada.'
                : 'Cifrada com chave própria, derivada só para este segredo.'}
            </span>
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="segredo-notas">
              Observação (opcional)
            </label>
            <textarea
              id="segredo-notas"
              className="textarea"
              rows={2}
              value={edicao.notas}
              onChange={(e) => aoMudar({ ...edicao, notas: e.target.value })}
              placeholder="Onde se usa, quem pediu, o que cuidar"
            />
          </div>

          <div className="modal-acoes">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className={`btn -primario ${ocupado ? '-carregando' : ''}`} disabled={ocupado}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

/** Com quem está dividida, até quando, e quem já abriu. */
function PainelDeCompartilhamento({
  segredo,
  meuId,
  aoFechar,
}: {
  segredo: SegredoView;
  meuId: string;
  aoFechar: () => void;
}) {
  const [concessoes, setConcessoes] = useState<ConcessaoView[]>([]);
  const [leituras, setLeituras] = useState<LeituraDoSegredoView[]>([]);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [quem, setQuem] = useState('');
  const [prazo, setPrazo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void compartilhamentosDoSegredo(segredo.id).then(setConcessoes).catch(() => undefined);
    void leiturasDoSegredo(segredo.id).then(setLeituras).catch(() => undefined);
    void listarPessoas().then(setPessoas).catch(() => undefined);
  }, [segredo.id]);

  const candidatos = pessoas.filter(
    (p) => p.id !== meuId && !concessoes.some((c) => c.user.id === p.id),
  );

  async function compartilhar(evento: FormEvent) {
    evento.preventDefault();
    if (!quem) return;

    setErro(null);
    setOcupado(true);
    try {
      setConcessoes(
        await compartilharSegredo(segredo.id, {
          userId: quem,
          // Sem data é sem prazo — que a tela chama de "até revogar",
          // porque "para sempre" faz parecer que não dá para tirar.
          expiresAt: prazo ? new Date(`${prazo}T23:59:59`).toISOString() : null,
        }),
      );
      setQuem('');
      setPrazo('');
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível compartilhar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Compartilhar ${segredo.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{segredo.name}</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <div className="modal-forma pilha-sm">
          {erro ? (
            <div className="alerta-bloco -erro" role="alert">
              <span aria-hidden="true">!</span>
              <span>{erro}</span>
            </div>
          ) : null}

          <form className="pilha-sm" onSubmit={compartilhar} noValidate>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="segredo-quem">
                Compartilhar com
              </label>
              <select
                id="segredo-quem"
                className="input"
                value={quem}
                onChange={(e) => setQuem(e.target.value)}
              >
                <option value="">Escolha a pessoa</option>
                {candidatos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="segredo-prazo">
                Até quando (opcional)
              </label>
              <input
                id="segredo-prazo"
                className="input"
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
              <span className="campo-ajuda">
                Em branco, vale até você revogar. Com data, o acesso acaba sozinho — e é o que
                você quer para quem só precisa entrar hoje.
              </span>
            </div>

            <button
              type="submit"
              className={`btn -primario ${ocupado ? '-carregando' : ''}`}
              disabled={!quem || ocupado}
            >
              Compartilhar
            </button>
          </form>

          <h4>Quem tem acesso</h4>
          {concessoes.length === 0 ? (
            <p className="campo-ajuda">Só você.</p>
          ) : (
            <div className="pilha-sm">
              {concessoes.map((c) => (
                <div key={c.id} className="linha-aparelho">
                  <div>
                    <strong>{c.user.name}</strong>
                    {c.vencida ? <span className="selo -aviso">vencida</span> : null}
                    <span className="campo-ajuda" style={{ display: 'block' }}>
                      {c.expiresAt ? `até ${dataCurta(c.expiresAt)}` : 'sem prazo'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn -fantasma -sm"
                    onClick={() => {
                      void revogarCompartilhamento(segredo.id, c.id)
                        .then(setConcessoes)
                        .catch(() => setErro('Não foi possível revogar.'));
                    }}
                  >
                    Revogar
                  </button>
                </div>
              ))}
            </div>
          )}

          <h4>Quem abriu esta senha</h4>
          {leituras.length === 0 ? (
            <p className="campo-ajuda">Ninguém ainda.</p>
          ) : (
            <ul className="lista-simples">
              {leituras.slice(0, 20).map((l) => (
                <li key={l.id}>
                  <strong>{l.user.name}</strong>{' '}
                  <span className="campo-ajuda">{dataCurta(l.readAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
