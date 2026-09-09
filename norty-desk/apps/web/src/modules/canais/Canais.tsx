import { useCallback, useEffect, useMemo, useState } from 'react';

import { ErroDaApi } from '../../api/cliente';
import {
  coletarAgora,
  criarCanal,
  desativarCanal,
  editarCanal,
  listarCanais,
  testarCanal,
  type CanalView,
  type TipoDeCanal,
} from '../../api/canais';
import { listarTimes, type TimeView } from '../../api/endpoints';
import { dataCurta } from '../../lib/formato';
import { CAMPOS, DESCRICAO_TIPO, ROTULO_TIPO, padroesDe, type Campo } from './campos';

const TIPOS: TipoDeCanal[] = ['EMAIL_IMAP', 'EMAIL_SMTP', 'EMAIL_WEBHOOK', 'WHATSAPP_EVOLUTION'];

/**
 * Configuração de canais.
 *
 * Cada conta é uma porta de entrada ou de saída. O botão "testar" existe
 * porque a alternativa é o operador salvar, ir embora, e descobrir dois
 * dias depois — pelo cliente reclamando — que a senha estava errada.
 */
export function Canais() {
  const [canais, setCanais] = useState<CanalView[] | null>(null);
  const [times, setTimes] = useState<TimeView[]>([]);
  const [emEdicao, setEmEdicao] = useState<CanalView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCanais(await listarCanais());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar os canais.'));
    void listarTimes()
      .then(setTimes)
      .catch(() => undefined);
  }, [recarregar]);

  /**
   * Uma ação de canal.
   *
   * Devolve `ok: false` para o que falhou de verdade sem ser exceção —
   * um teste de conexão que respondeu "senha errada" é resposta, não
   * erro de rede, e o operador precisa ler o motivo do mesmo jeito.
   */
  async function executar(id: string, acao: () => Promise<{ ok: boolean; mensagem: string }>) {
    setErro(null);
    setAviso(null);
    setOcupado(id);
    try {
      const r = await acao();
      if (r.ok) setAviso(r.mensagem);
      else setErro(r.mensagem);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(null);
    }
  }

  if (!canais) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha" style={{ maxWidth: 940 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Canais</h2>
          <p>
            Por onde o chamado entra e por onde a resposta sai. Um chamado nasce igual em
            qualquer porta — o canal só traduz a mensagem.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => setEmEdicao('novo')}>
          Novo canal
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {aviso ? (
        <div className="alerta-bloco -sucesso">
          <span aria-hidden="true">✓</span>
          <span>{aviso}</span>
        </div>
      ) : null}

      {canais.length === 0 ? (
        <div className="vazio">
          <div className="vazio-arte" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16v12H4z" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </div>
          <h3>Nenhum canal configurado</h3>
          <p>
            Enquanto não houver canal, o chamado só entra pela web e pela API pública. Comece
            pela caixa de e-mail do suporte.
          </p>
        </div>
      ) : (
        <div className="pilha">
          {canais.map((canal) => (
            <Cartao
              key={canal.id}
              canal={canal}
              times={times}
              ocupado={ocupado === canal.id}
              aoEditar={() => setEmEdicao(canal)}
              aoTestar={() =>
                void executar(canal.id, async () => {
                  const r = await testarCanal(canal.id);
                  return { ok: r.ok, mensagem: r.detalhe };
                })
              }
              aoColetar={() =>
                void executar(canal.id, async () => {
                  const r = await coletarAgora(canal.id);
                  return {
                    ok: true,
                    mensagem: `${r.lidas} mensagem(ns) lida(s), ${r.aceitas} aceita(s).`,
                  };
                })
              }
              aoAlternar={() =>
                void executar(canal.id, async () => {
                  if (canal.isActive) {
                    await desativarCanal(canal.id);
                    return { ok: true, mensagem: 'Canal desativado.' };
                  }
                  await editarCanal(canal.id, { isActive: true });
                  return { ok: true, mensagem: 'Canal ativado.' };
                })
              }
            />
          ))}
        </div>
      )}

      {emEdicao ? (
        <Formulario
          canal={emEdicao === 'novo' ? null : emEdicao}
          times={times}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'novo') {
              await criarCanal(dados as Parameters<typeof criarCanal>[0]);
            } else {
              await editarCanal(emEdicao.id, dados);
            }
            setEmEdicao(null);
            setAviso('Canal salvo.');
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function Cartao({
  canal,
  times,
  ocupado,
  aoEditar,
  aoTestar,
  aoColetar,
  aoAlternar,
}: {
  canal: CanalView;
  times: TimeView[];
  ocupado: boolean;
  aoEditar: () => void;
  aoTestar: () => void;
  aoColetar: () => void;
  aoAlternar: () => void;
}) {
  const time = times.find((t) => t.id === canal.defaultTeamId);
  const ehEntradaPorColeta = canal.kind === 'EMAIL_IMAP';

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo linha" style={{ gap: 'var(--e-2)', alignItems: 'center' }}>
            <span
              className={`canal ${canal.kind === 'WHATSAPP_EVOLUTION' ? '-whatsapp' : '-email'}`}
              aria-hidden="true"
            />
            {canal.name}
          </h3>
          <p className="card-sub">
            {ROTULO_TIPO[canal.kind]}
            {time ? ` · abre para ${time.name}` : ''}
          </p>
        </div>

        <span className={`selo ${canal.isActive ? '-sucesso' : '-neutro'}`}>
          {canal.isActive ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="card-corpo pilha-sm">
        <ResumoDaConfig canal={canal} />

        {/* O último erro fica na tela até a próxima coleta dar certo. Um
            erro que some sozinho é um erro que ninguém conserta. */}
        {canal.lastError ? (
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>
              Última tentativa falhou: {canal.lastError}
              {canal.lastSyncAt ? ` (${dataCurta(canal.lastSyncAt)})` : ''}
            </span>
          </div>
        ) : canal.lastSyncAt ? (
          <p className="campo-ajuda">Última sincronização em {dataCurta(canal.lastSyncAt)}.</p>
        ) : (
          <p className="campo-ajuda">Ainda não sincronizou.</p>
        )}
      </div>

      <div className="card-rodape linha" style={{ gap: 'var(--e-2)' }}>
        <button type="button" className="btn -secundario -sm" onClick={aoEditar}>
          Editar
        </button>
        <button
          type="button"
          className={`btn -fantasma -sm ${ocupado ? '-carregando' : ''}`}
          disabled={ocupado}
          onClick={aoTestar}
        >
          Testar
        </button>
        {ehEntradaPorColeta ? (
          <button
            type="button"
            className="btn -fantasma -sm"
            disabled={ocupado || !canal.isActive}
            onClick={aoColetar}
          >
            Coletar agora
          </button>
        ) : null}
        <button
          type="button"
          className="btn -fantasma -sm"
          style={{ marginLeft: 'auto' }}
          disabled={ocupado}
          onClick={aoAlternar}
        >
          {canal.isActive ? 'Desativar' : 'Ativar'}
        </button>
      </div>
    </section>
  );
}

/** O que dá para mostrar sem revelar segredo. */
function ResumoDaConfig({ canal }: { canal: CanalView }) {
  const linhas = CAMPOS[canal.kind]
    .map((campo) => [campo, canal.config[campo.chave]] as const)
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '');

  if (linhas.length === 0) return <p className="campo-ajuda">Sem configuração.</p>;

  return (
    <dl className="lista-definicao">
      {linhas.map(([campo, valor]) => (
        <div key={campo.chave} className="lista-definicao-item">
          <dt>{campo.rotulo}</dt>
          <dd>{valorLegivel(campo, valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

function valorLegivel(campo: Campo, valor: unknown): string {
  // A API troca o segredo por um booleano: existe, ou não existe.
  if (campo.tipo === 'segredo') return valor ? '••••••••' : 'não definido';
  if (campo.tipo === 'booleano') return valor ? 'sim' : 'não';
  return String(valor);
}

function Formulario({
  canal,
  times,
  aoFechar,
  aoSalvar,
}: {
  canal: CanalView | null;
  times: TimeView[];
  aoFechar: () => void;
  aoSalvar: (dados: {
    kind?: TipoDeCanal;
    name: string;
    config: Record<string, unknown>;
    defaultTeamId?: string;
  }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoDeCanal>(canal?.kind ?? 'EMAIL_IMAP');
  const [nome, setNome] = useState(canal?.name ?? '');
  const [time, setTime] = useState(canal?.defaultTeamId ?? '');
  const [config, setConfig] = useState<Record<string, unknown>>(
    canal ? { ...canal.config } : padroesDe('EMAIL_IMAP'),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const campos = useMemo(() => CAMPOS[tipo], [tipo]);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={canal ? 'Editar canal' : 'Novo canal'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{canal ? 'Editar canal' : 'Novo canal'}</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            setSalvando(true);
            void aoSalvar({
              ...(canal ? {} : { kind: tipo }),
              name: nome,
              config,
              ...(time ? { defaultTeamId: time } : {}),
            })
              .catch((erroDoSalvar: unknown) =>
                setErro(
                  erroDoSalvar instanceof ErroDaApi
                    ? erroDoSalvar.message
                    : 'Não foi possível salvar.',
                ),
              )
              .finally(() => setSalvando(false));
          }}
        >
          <div className="modal-corpo pilha">
            {erro ? (
              <div className="alerta-bloco -erro">
                <span aria-hidden="true">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            <div className="campo">
              <label className="campo-rotulo" htmlFor="tipo-canal">
                Tipo
              </label>
              <select
                id="tipo-canal"
                className="select"
                value={tipo}
                // O tipo define o formulário inteiro; trocá-lo depois de
                // salvo invalidaria a configuração guardada.
                disabled={Boolean(canal)}
                onChange={(e) => {
                  const novo = e.target.value as TipoDeCanal;
                  setTipo(novo);
                  setConfig(padroesDe(novo));
                }}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO[t]}
                  </option>
                ))}
              </select>
              <span className="campo-ajuda">{DESCRICAO_TIPO[tipo]}</span>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="nome-canal">
                Nome
              </label>
              <input
                id="nome-canal"
                className="input"
                value={nome}
                required
                minLength={2}
                maxLength={120}
                placeholder="Suporte — caixa principal"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="time-canal">
                Time padrão
              </label>
              <select
                id="time-canal"
                className="select"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              >
                <option value="">Nenhum — deixa a regra de entrada decidir</option>
                {times.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <hr className="divisor" />

            {campos.map((campo) => (
              <CampoDeConfig
                key={campo.chave}
                campo={campo}
                valor={config[campo.chave]}
                aoMudar={(valor) => setConfig((atual) => ({ ...atual, [campo.chave]: valor }))}
              />
            ))}
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button
              type="submit"
              className={`btn -primario ${salvando ? '-carregando' : ''}`}
              disabled={salvando}
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CampoDeConfig({
  campo,
  valor,
  aoMudar,
}: {
  campo: Campo;
  valor: unknown;
  aoMudar: (valor: unknown) => void;
}) {
  const id = `config-${campo.chave}`;

  if (campo.tipo === 'booleano') {
    return (
      <label className="switch">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(valor)}
          onChange={(e) => aoMudar(e.target.checked)}
        />
        <span className="switch-trilho">
          <span className="switch-bolinha" />
        </span>
        <span>{campo.rotulo}</span>
      </label>
    );
  }

  // Um segredo já guardado chega como `true`. Mostrar o booleano no
  // campo seria mentira; mostrar vazio faria o operador achar que
  // apagou. O texto do lugar diz o que há, e deixar em branco preserva.
  const jaTemSegredo = campo.tipo === 'segredo' && typeof valor === 'boolean' && valor;
  const texto = typeof valor === 'boolean' ? '' : (valor ?? '');

  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        {campo.rotulo}
      </label>
      <input
        id={id}
        className="input"
        type={campo.tipo === 'segredo' ? 'password' : campo.tipo === 'numero' ? 'number' : 'text'}
        value={String(texto)}
        required={campo.obrigatorio && !jaTemSegredo}
        autoComplete={campo.tipo === 'segredo' ? 'new-password' : 'off'}
        placeholder={jaTemSegredo ? 'Guardado — deixe em branco para manter' : undefined}
        onChange={(e) => {
          const bruto = e.target.value;
          if (campo.tipo === 'segredo' && bruto === '') {
            // Vazio num segredo que já existe significa "não mexi": o
            // booleano volta para a API, que preserva o que está lá.
            aoMudar(jaTemSegredo ? true : '');
            return;
          }
          aoMudar(campo.tipo === 'numero' ? Number(bruto) : bruto);
        }}
      />
      {campo.ajuda ? <span className="campo-ajuda">{campo.ajuda}</span> : null}
    </div>
  );
}
