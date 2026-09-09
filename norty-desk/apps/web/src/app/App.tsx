import { useState } from 'react';

import { Chamado } from '../modules/chamado/Chamado';
import { Fila } from '../modules/fila/Fila';
import { CHAMADOS } from '../lib/demonstracao';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

type Tela = { nome: 'fila' } | { nome: 'chamado'; id: string };

/**
 * Casca do aplicativo do agente.
 *
 * O portal do solicitante é uma superfície separada, com layout próprio
 * (`.tela-publica`) — ver `docs/02-gap-analysis.md`, item 9. Ele entra na
 * Fase 2, e o CSS dele será `portal.css`, no lugar em que o LICITA+
 * guarda o `publico.css`.
 */
export function App() {
  const [tela, setTela] = useState<Tela>({ nome: 'fila' });

  const chamado = tela.nome === 'chamado' ? CHAMADOS.find((c) => c.id === tela.id) : undefined;

  const slaEstourando = CHAMADOS.filter(
    (c) => (c.commitments[0]?.remainingSeconds ?? Infinity) < 3600,
  ).length;

  return (
    <div className="shell">
      <Sidebar
        contadores={{
          meus: CHAMADOS.filter((c) => c.assignedUser !== null).length,
          time: CHAMADOS.length,
          semAtribuicao: CHAMADOS.filter((c) => !c.assignedTeam && !c.assignedUser).length,
          slaEstourando,
        }}
        aoNavegar={() => setTela({ nome: 'fila' })}
      />

      <div className="principal">
        <Header
          titulo={chamado ? `#${chamado.number} ${chamado.subject}` : 'Do meu time'}
          trilha={chamado ? ['Fila', 'Chamado'] : ['Fila']}
          aoVoltar={chamado ? () => setTela({ nome: 'fila' }) : undefined}
        />

        {/* Enquanto o VITE_DATA_SOURCE for mock, a faixa é
            inegociável: o risco é alguém tratar chamado de mentira
            como fila de verdade. */}
        <div className="faixa-demo">
          <span aria-hidden="true">⚠</span>
          <span>
            Dados de demonstração. Nenhum chamado aqui é real — a API ainda não está ligada.
          </span>
        </div>

        <main className="conteudo" id="conteudo">
          {chamado ? (
            <Chamado chamado={chamado} />
          ) : (
            <Fila chamados={CHAMADOS} aoAbrir={(id) => setTela({ nome: 'chamado', id })} />
          )}
        </main>
      </div>
    </div>
  );
}
