import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { VerificacaoSugerida } from '@norty-desk/shared';

import {
  confirmarResolucao,
  desconfirmarResolucao,
  verificacoesDoChamado,
} from '../../api/conhecimento';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * "Já houve isto antes — confira."
 *
 * Substitui a lista de artigos parecidos, e a diferença não é de
 * enfeite. A lista dizia "existe algo sobre este assunto" e ficava
 * recolhida, como oferta. Aqui há uma **afirmação** — isto já
 * aconteceu, e isto resolveu — com o número de chamados que aquela
 * resolução fechou, e um gesto para confirmar ou descartar.
 *
 * É a confirmação que faz o índice aprender: o que resolve sobe, e quem
 * atender o próximo chamado parecido encontra primeiro o que costuma
 * funcionar. Sem o gesto, a ordem seria para sempre casamento de texto,
 * e texto parecido não é a mesma coisa que solução que funcionou.
 */
export function Verificacoes({ ticketId }: { ticketId: string }) {
  const { can } = useAutenticacao();
  const [itens, setItens] = useState<VerificacaoSugerida[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setItens(await verificacoesDoChamado(ticketId));
  }, [ticketId]);

  useEffect(() => {
    void recarregar().catch(() => setItens([]));
  }, [recarregar]);

  if (!itens || itens.length === 0) return null;

  const podeConfirmar = can('chamado:responder');

  async function alternar(item: VerificacaoSugerida) {
    setOcupado(item.id);
    try {
      setItens(
        item.confirmada
          ? await desconfirmarResolucao(ticketId, item.id)
          : await confirmarResolucao(ticketId, item.id),
      );
    } catch {
      // Marcar é conveniência; falhar em silêncio e deixar a pessoa
      // seguir atendendo é melhor que um alerta sobre o índice.
    } finally {
      setOcupado(null);
    }
  }

  const jaResolvidos = itens.filter((i) => i.resolvedCount > 0).length;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Já houve isto antes</h3>
          <p className="card-sub">
            {jaResolvidos > 0
              ? 'Confira estes pontos: já resolveram chamados parecidos.'
              : 'O que já foi escrito sobre este assunto.'}
          </p>
        </div>
      </div>

      <div className="card-corpo pilha-sm">
        {itens.map((item) => (
          <div
            key={item.id}
            className="linha-entre"
            style={{ gap: 'var(--e-3)', alignItems: 'flex-start', flexWrap: 'nowrap' }}
          >
            <span style={{ minWidth: 0 }}>
              <Link to={`/conhecimento/${item.id}`} className="tabela-titulo-celula">
                {item.title}
              </Link>
              <span className="campo-ajuda" style={{ display: 'block' }}>
                {item.resolvedCount > 0 ? (
                  <>
                    Resolveu {item.resolvedCount}{' '}
                    {item.resolvedCount === 1 ? 'chamado' : 'chamados'}
                    {item.fromTicket ? ` · veio do #${item.fromTicket.number}` : ''}
                  </>
                ) : item.fromTicket ? (
                  `Escrito a partir do #${item.fromTicket.number}`
                ) : (
                  (item.excerpt ?? 'Artigo da base de conhecimento')
                )}
              </span>
            </span>

            {podeConfirmar ? (
              <button
                type="button"
                className={`btn -sm ${item.confirmada ? '-secundario' : '-fantasma'}`}
                style={{ flex: 'none' }}
                disabled={ocupado === item.id}
                onClick={() => void alternar(item)}
              >
                {item.confirmada ? '✓ resolveu' : 'foi isto'}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
