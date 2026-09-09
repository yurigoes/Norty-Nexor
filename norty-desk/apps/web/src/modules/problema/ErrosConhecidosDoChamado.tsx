import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ErroConhecidoSugerido } from '@norty-desk/shared';

import { errosConhecidosDoChamado, vincularChamadoAoProblema } from '../../api/problemas';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * "Isso já é um problema conhecido?"
 *
 * O gesto que paga a gestão de problema inteira: quem atende o décimo
 * chamado igual vê o contorno antes de escalar, e vincula o chamado ao
 * problema com um clique — que é o que mantém a contagem honesta.
 *
 * Fica acima da conversa, junto das sugestões da base: se aparecesse no
 * trilho lateral, seria lido depois da resposta já escrita.
 */
export function ErrosConhecidosDoChamado({
  ticketId,
  problemaVinculado,
  aoVincular,
}: {
  ticketId: string;
  /**
   * O problema que o chamado já aponta, vindo do próprio chamado.
   *
   * Marcar o vínculo com estado local parecia bastar e não bastava: a
   * tela do chamado recarrega depois de vincular, este componente
   * desmonta junto, e o "vinculado" sumia um segundo depois de
   * aparecer. O que o servidor sabe não se guarda aqui.
   */
  problemaVinculado: string | null;
  aoVincular?: () => void;
}) {
  const { can } = useAutenticacao();
  const [erros, setErros] = useState<ErroConhecidoSugerido[] | null>(null);

  useEffect(() => {
    if (!can('problema:ler')) return;
    void errosConhecidosDoChamado(ticketId)
      .then(setErros)
      .catch(() => setErros([]));
  }, [ticketId, can]);

  if (!erros || erros.length === 0) return null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Já é um problema conhecido</h3>
          <p className="card-sub">
            {erros.length} erro(s) conhecido(s) casam com este chamado. O contorno está aqui.
          </p>
        </div>
      </div>

      <div className="card-corpo pilha-sm">
        {erros.map((erro) => (
          <div key={erro.id} className="pilha-sm">
            <div className="linha-entre" style={{ gap: 'var(--e-3)' }}>
              <Link to={`/problemas/${erro.id}`} style={{ minWidth: 0 }}>
                <span className="mono">P#{erro.number}</span> {erro.title}
              </Link>
              {problemaVinculado === erro.id ? (
                <span className="selo -sucesso" style={{ flex: 'none' }}>
                  vinculado
                </span>
              ) : (
                <button
                  type="button"
                  className="btn -secundario -sm"
                  style={{ flex: 'none' }}
                  onClick={() => {
                    void vincularChamadoAoProblema(erro.id, ticketId).then(() => aoVincular?.());
                  }}
                >
                  vincular
                </button>
              )}
            </div>
            {erro.workaround ? (
              <p className="campo-ajuda" style={{ whiteSpace: 'pre-wrap' }}>
                {erro.workaround}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
