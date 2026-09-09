import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApprovalView } from '@norty-desk/shared';

import { decidirAprovacao, minhasAprovacoes } from '../../api/aprovacoes';
import { ErroDaApi } from '../../api/cliente';
import { dataCurta } from '../../lib/formato';

/**
 * O que espera decisão minha.
 *
 * A mesma tela serve o agente e o portal: quem aprova uma compra pode
 * ser alguém que nunca abriu um chamado na vida, e obrigá-lo a caçar o
 * chamado para achar o botão é como se perde uma aprovação por três
 * dias.
 */
export function MinhasAprovacoes({ noPortal = false }: { noPortal?: boolean }) {
  const [linhas, setLinhas] = useState<ApprovalView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});

  const recarregar = useCallback(async () => {
    setLinhas(await minhasAprovacoes());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar as aprovações.'));
  }, [recarregar]);

  async function decidir(id: string, decision: 'APROVADO' | 'RECUSADO') {
    setErro(null);
    setOcupado(id);
    try {
      await decidirAprovacao(id, { decision, comment: comentarios[id] || undefined });
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível registrar a decisão.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="pilha" style={{ maxWidth: 820 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Aprovações</h2>
          <p>O que espera a sua decisão. A etapa seguinte só começa quando esta passa.</p>
        </div>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!linhas ? (
        <div className="sk sk-bloco" />
      ) : linhas.length === 0 ? (
        <div className="vazio">
          <h3>Nada esperando você</h3>
          <p>Quando alguém pedir a sua aprovação, ela aparece aqui.</p>
        </div>
      ) : (
        linhas.map((linha) => (
          <section key={linha.id} className="card">
            <div className="card-topo">
              <div>
                <h3 className="card-titulo">
                  {/* No portal o chamado pode não ser visível para quem
                      aprova: ser validador autoriza a decidir, não a ler
                      o chamado inteiro. Por isso aqui é texto, não link. */}
                  {noPortal ? (
                    <span>
                      #{linha.ticket.number} · {linha.ticket.subject}
                    </span>
                  ) : (
                    <Link to={`/chamados/${linha.ticket.id}`}>
                      #{linha.ticket.number} · {linha.ticket.subject}
                    </Link>
                  )}
                </h3>
                <p className="card-sub">
                  Etapa {linha.step} · {linha.quorum} “sim” necessário(s) · pedida em{' '}
                  {dataCurta(linha.requestedAt)}
                </p>
              </div>
            </div>

            <div className="card-corpo pilha-sm">
              <label className="campo-rotulo" htmlFor={`comentario-${linha.id}`}>
                Comentário (opcional)
              </label>
              <textarea
                id={`comentario-${linha.id}`}
                className="textarea"
                rows={2}
                maxLength={2000}
                value={comentarios[linha.id] ?? ''}
                onChange={(e) =>
                  setComentarios((atual) => ({ ...atual, [linha.id]: e.target.value }))
                }
              />
            </div>

            <div className="card-rodape linha" style={{ gap: 'var(--e-2)' }}>
              <button
                type="button"
                className="btn -sucesso -sm"
                disabled={ocupado === linha.id}
                onClick={() => void decidir(linha.id, 'APROVADO')}
              >
                Aprovar
              </button>
              <button
                type="button"
                className="btn -perigo -sm"
                disabled={ocupado === linha.id}
                onClick={() => void decidir(linha.id, 'RECUSADO')}
              >
                Recusar
              </button>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
