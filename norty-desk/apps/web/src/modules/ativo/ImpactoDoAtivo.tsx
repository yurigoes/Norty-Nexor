import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ImpactoView, MotivoDeImpacto } from '@norty-desk/shared';
import { ROTULO_ATIVO_STATUS, ROTULO_MUDANCA_STATUS, ticketTag } from '@norty-desk/shared';

import { impactoDoAtivo } from '../../api/ativos';
import { dataCurta } from '../../lib/formato';

const ROTULO_MOTIVO: Record<MotivoDeImpacto, string> = {
  PERIFERICO: 'pendurado nele',
  CABO: 'ligado por cabo',
};

/**
 * O que cai junto com este equipamento.
 *
 * A pergunta é a de antes da manutenção: "posso desligar isto agora?".
 * A resposta tem duas metades, e as duas ficam aqui — os equipamentos
 * que a queda alcança, e as consequências: chamado aberto, mudança
 * marcada, reserva de alguém, gente para avisar. Em telas separadas a
 * segunda nunca seria aberta.
 *
 * Fica fechado por padrão: quem abre a ficha do equipamento na maior
 * parte das vezes quer outra coisa, e uma travessia de grafo a cada
 * abertura é consulta paga por quem não pediu.
 */
export function ImpactoDoAtivoCard({ assetId }: { assetId: string }) {
  const [aberto, setAberto] = useState(false);
  const [profundidade, setProfundidade] = useState(2);
  const [impacto, setImpacto] = useState<ImpactoView | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setImpacto(await impactoDoAtivo(assetId, { profundidade }));
  }, [assetId, profundidade]);

  useEffect(() => {
    if (!aberto) return;
    setImpacto(null);
    void carregar().catch(() => setErro('Não foi possível analisar o impacto.'));
  }, [aberto, carregar]);

  const nada =
    impacto &&
    impacto.nos.length === 0 &&
    impacto.chamadosAbertos.length === 0 &&
    impacto.reservas.length === 0 &&
    impacto.mudancasPlanejadas.length === 0;

  return (
    <section className="card">
      <div className="card-topo">
        <h3 className="card-titulo">O que cai junto</h3>
        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          {aberto ? (
            <>
              <label className="so-leitor" htmlFor="imp-prof">
                Quantos saltos seguir
              </label>
              <select
                id="imp-prof"
                className="select -auto"
                value={profundidade}
                onChange={(e) => setProfundidade(Number(e.target.value))}
              >
                <option value={1}>1 salto</option>
                <option value={2}>2 saltos</option>
                <option value={3}>3 saltos</option>
              </select>
            </>
          ) : null}
          <button
            type="button"
            className="btn -secundario -sm"
            onClick={() => setAberto(!aberto)}
          >
            {aberto ? 'Fechar' : 'Analisar'}
          </button>
        </div>
      </div>

      {aberto ? (
        <div className="card-corpo pilha-sm">
          {erro ? (
            <div className="alerta-bloco -erro">
              <span aria-hidden="true">!</span>
              <span>{erro}</span>
            </div>
          ) : null}

          {!impacto ? (
            <div className="sk sk-linha" />
          ) : nada ? (
            <p className="campo-ajuda">
              Nada depende deste equipamento, e não há chamado, reserva nem mudança em curso.
            </p>
          ) : (
            <>
              {impacto.nos.length > 0 ? (
                <>
                  <p className="campo-ajuda" style={{ margin: 0 }}>
                    {impacto.nos.length === 1
                      ? '1 equipamento depende deste:'
                      : `${impacto.nos.length} equipamentos dependem deste:`}
                  </p>
                  <ul className="lista-simples">
                    {impacto.nos.map((n) => (
                      <li key={n.asset.id}>
                        <Link to={`/ativos/${n.asset.id}`}>{n.asset.name}</Link>
                        <span className="campo-ajuda">
                          {' '}
                          · {ROTULO_MOTIVO[n.motivo]} · {ROTULO_ATIVO_STATUS[n.status]}
                          {n.user ? ` · com ${n.user.name}` : ''}
                          {n.client ? ` · ${n.client.name}` : ''}
                        </span>
                        {/* O caminho é o "por quê" da linha: sem ele a
                            lista é um monte de nomes sem explicação. */}
                        {n.profundidade > 1 ? (
                          <span className="campo-ajuda" style={{ display: 'block' }}>
                            {n.caminho.join(' → ')}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {impacto.truncado ? (
                <div className="alerta-bloco -aviso">
                  <span aria-hidden="true">!</span>
                  <span>
                    A lista parou no teto e há mais além dele. Diminua os saltos para ver o que
                    está mais perto.
                  </span>
                </div>
              ) : null}

              {impacto.reservas.length > 0 ? (
                <div className="alerta-bloco -aviso">
                  <span aria-hidden="true">!</span>
                  <span>
                    {impacto.reservas.map((r) => (
                      <span key={r.id} style={{ display: 'block' }}>
                        {r.asset.name} está reservado para {r.user.name} até{' '}
                        {dataCurta(r.endsAt)}
                        {r.purpose ? ` (${r.purpose})` : ''}.
                      </span>
                    ))}
                  </span>
                </div>
              ) : null}

              {impacto.chamadosAbertos.length > 0 ? (
                <>
                  <p className="campo-ajuda" style={{ margin: 0 }}>Chamado aberto no caminho:</p>
                  <ul className="lista-simples">
                    {impacto.chamadosAbertos.map((c) => (
                      <li key={c.id}>
                        <Link to={`/chamados/${c.id}`}>
                          {ticketTag(c.number)} {c.subject}
                        </Link>
                        <span className="campo-ajuda"> · {c.asset.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {impacto.mudancasPlanejadas.length > 0 ? (
                <>
                  <p className="campo-ajuda" style={{ margin: 0 }}>Mudança marcada:</p>
                  <ul className="lista-simples">
                    {impacto.mudancasPlanejadas.map((m) => (
                      <li key={m.id}>
                        <Link to={`/mudancas/${m.id}`}>{m.title}</Link>
                        <span className="campo-ajuda">
                          {' '}
                          · {ROTULO_MUDANCA_STATUS[m.status]}
                          {m.windowStart ? ` · ${dataCurta(m.windowStart)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {impacto.pessoas.length > 0 ? (
                <p className="campo-ajuda">
                  Avisar: {impacto.pessoas.map((p) => p.name).join(', ')}.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
