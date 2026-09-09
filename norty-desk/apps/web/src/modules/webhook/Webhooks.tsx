import { useCallback, useEffect, useState } from 'react';

import { ErroDaApi } from '../../api/cliente';
import {
  criarWebhook,
  desativarWebhook,
  editarWebhook,
  entregasDoWebhook,
  eventosDeWebhook,
  listarWebhooks,
  reenviarEntrega,
  testarWebhook,
  type EntregaView,
  type WebhookView,
} from '../../api/webhooks';
import { dataCurta } from '../../lib/formato';

/**
 * Webhooks de saída.
 *
 * O que a tela precisa deixar óbvio: a assinatura existe, o log de
 * entrega existe, e dá para reenviar. Integração que falha em silêncio
 * é o que faz alguém desistir de webhook e ficar consultando a API em
 * laço.
 */
export function Webhooks() {
  const [webhooks, setWebhooks] = useState<WebhookView[] | null>(null);
  const [eventos, setEventos] = useState<string[]>([]);
  const [emEdicao, setEmEdicao] = useState<WebhookView | 'novo' | null>(null);
  const [logDe, setLogDe] = useState<WebhookView | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setWebhooks(await listarWebhooks());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar os webhooks.'));
    void eventosDeWebhook()
      .then(setEventos)
      .catch(() => undefined);
  }, [recarregar]);

  return (
    <div className="pilha" style={{ maxWidth: 940 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Webhooks</h2>
          <p>
            O Norty Desk avisa o seu sistema quando algo acontece. Cada entrega vai assinada
            em HMAC-SHA256 e fica no log — inclusive as que falharam.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => setEmEdicao('novo')}>
          Novo webhook
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

      {!webhooks ? (
        <div className="sk sk-bloco" />
      ) : webhooks.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum webhook</h3>
          <p>
            Assine um evento para o seu sistema saber do chamado sem consultar a API em laço.
          </p>
        </div>
      ) : (
        webhooks.map((webhook) => (
          <section key={webhook.id} className="card">
            <div className="card-topo">
              <div>
                <h3 className="card-titulo">{webhook.name}</h3>
                <p className="card-sub mono">{webhook.url}</p>
              </div>
              <span className={`selo ${webhook.isActive ? '-sucesso' : '-neutro'}`}>
                {webhook.isActive ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            <div className="card-corpo pilha-sm">
              <div className="linha" style={{ gap: 'var(--e-1)', flexWrap: 'wrap' }}>
                {webhook.events.map((e) => (
                  <span key={e} className="selo -contorno">
                    {e}
                  </span>
                ))}
              </div>
              <p className="campo-ajuda">
                {webhook.deliveryCount} entrega(s) no log ·{' '}
                {webhook.hasSecret ? 'assinatura configurada' : 'sem segredo'}
              </p>
            </div>

            <div className="card-rodape linha" style={{ gap: 'var(--e-2)' }}>
              <button
                type="button"
                className="btn -secundario -sm"
                onClick={() => setEmEdicao(webhook)}
              >
                Editar
              </button>
              <button
                type="button"
                className="btn -fantasma -sm"
                onClick={() => {
                  setErro(null);
                  void testarWebhook(webhook.id)
                    .then((entregas) => {
                      const ultima = entregas[0];
                      if (ultima?.status === 'ENVIADO') setAviso('Entrega de teste aceita.');
                      else setErro(`Entrega de teste falhou: ${ultima?.lastError ?? '—'}`);
                    })
                    .catch(() => setErro('Não foi possível testar.'));
                }}
              >
                Enviar teste
              </button>
              <button
                type="button"
                className="btn -fantasma -sm"
                onClick={() => setLogDe(webhook)}
              >
                Log de entregas
              </button>
              <button
                type="button"
                className="btn -fantasma -sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  const acao = webhook.isActive
                    ? desativarWebhook(webhook.id)
                    : editarWebhook(webhook.id, { isActive: true });
                  void acao.then(recarregar).catch(() => setErro('Não foi possível concluir.'));
                }}
              >
                {webhook.isActive ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </section>
        ))
      )}

      {emEdicao ? (
        <Formulario
          webhook={emEdicao === 'novo' ? null : emEdicao}
          eventos={eventos}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'novo') {
              await criarWebhook(dados as Parameters<typeof criarWebhook>[0]);
            } else {
              await editarWebhook(emEdicao.id, dados);
            }
            setEmEdicao(null);
            setAviso('Webhook salvo.');
            await recarregar();
          }}
        />
      ) : null}

      {logDe ? <Log webhook={logDe} aoFechar={() => setLogDe(null)} /> : null}
    </div>
  );
}

function Log({ webhook, aoFechar }: { webhook: WebhookView; aoFechar: () => void }) {
  const [entregas, setEntregas] = useState<EntregaView[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    void entregasDoWebhook(webhook.id)
      .then(setEntregas)
      .catch(() => setEntregas([]));
  }, [webhook.id]);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal -lg"
        role="dialog"
        aria-modal="true"
        aria-label={`Entregas de ${webhook.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <div>
            <h3 className="card-titulo">Log de entregas</h3>
            <p className="card-sub">{webhook.name}</p>
          </div>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <div className="modal-corpo">
          {!entregas ? (
            <div className="sk sk-bloco" />
          ) : entregas.length === 0 ? (
            <p className="campo-ajuda">Nenhuma entrega ainda.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Evento</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entregas.map((entrega) => (
                    <tr key={entrega.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dataCurta(entrega.createdAt)}</td>
                      <td className="mono">{entrega.event}</td>
                      <td>
                        {entrega.status === 'ENVIADO' ? (
                          <span className="selo -sucesso">
                            HTTP {entrega.responseCode ?? 200}
                          </span>
                        ) : entrega.status === 'FALHOU' ? (
                          <span className="selo -erro" title={entrega.lastError ?? undefined}>
                            falhou · {entrega.attempts} tentativa(s)
                          </span>
                        ) : (
                          <span className="selo -aviso">
                            na fila{entrega.attempts > 0 ? ` · ${entrega.attempts}ª` : ''}
                          </span>
                        )}
                      </td>
                      <td className="-num">
                        {entrega.status === 'ENVIADO' ? null : (
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            disabled={ocupado === entrega.id}
                            onClick={() => {
                              setOcupado(entrega.id);
                              void reenviarEntrega(entrega.id)
                                .then(setEntregas)
                                .finally(() => setOcupado(null));
                            }}
                          >
                            Reenviar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-rodape">
          <button type="button" className="btn -fantasma" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function Formulario({
  webhook,
  eventos,
  aoFechar,
  aoSalvar,
}: {
  webhook: WebhookView | null;
  eventos: string[];
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    url: string;
    secret?: string;
    events: string[];
  }) => Promise<void>;
}) {
  const [nome, setNome] = useState(webhook?.name ?? '');
  const [url, setUrl] = useState(webhook?.url ?? 'https://');
  const [segredo, setSegredo] = useState('');
  const [assinados, setAssinados] = useState<string[]>(webhook?.events ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={webhook ? 'Editar webhook' : 'Novo webhook'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{webhook ? 'Editar webhook' : 'Novo webhook'}</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            setOcupado(true);
            void aoSalvar({
              name: nome,
              url,
              events: assinados,
              ...(segredo ? { secret: segredo } : {}),
            })
              .catch((e2: unknown) =>
                setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
              )
              .finally(() => setOcupado(false));
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
              <label className="campo-rotulo" htmlFor="nome-webhook">
                Nome
              </label>
              <input
                id="nome-webhook"
                className="input"
                required
                minLength={2}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="url-webhook">
                Endereço de destino
              </label>
              <input
                id="url-webhook"
                className="input"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <span className="campo-ajuda">
                Só `https`, e nada de rede interna — o corpo carrega dado de chamado.
              </span>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="segredo-webhook">
                Segredo da assinatura
              </label>
              <input
                id="segredo-webhook"
                className="input"
                type="password"
                autoComplete="new-password"
                required={!webhook}
                minLength={16}
                value={segredo}
                placeholder={webhook?.hasSecret ? 'Guardado — deixe em branco para manter' : ''}
                onChange={(e) => setSegredo(e.target.value)}
              />
              <span className="campo-ajuda">
                Mínimo de 16 caracteres. É com ele que o seu lado confere a assinatura
                `X-Desk-Signature`.
              </span>
            </div>

            <div className="campo">
              <span className="campo-rotulo">Eventos assinados</span>
              <div className="pilha-sm" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {eventos.map((evento) => (
                  <label key={evento} className="check">
                    <input
                      type="checkbox"
                      checked={assinados.includes(evento)}
                      onChange={(e) =>
                        setAssinados((atual) =>
                          e.target.checked
                            ? [...atual, evento]
                            : atual.filter((x) => x !== evento),
                        )
                      }
                    />
                    <span className="mono">{evento}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn -primario"
              disabled={ocupado || assinados.length === 0}
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
