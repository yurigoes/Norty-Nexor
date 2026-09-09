import { useState } from 'react';

import { Chamado } from '../modules/chamado/Chamado';
import { Fila } from '../modules/fila/Fila';
import { CHAMADOS } from '../lib/demonstracao';
import { Cabecalho } from './Cabecalho';
import { Sidebar } from './Sidebar';

type Tela = { nome: 'fila' } | { nome: 'chamado'; id: string };

/**
 * Casca do aplicativo do agente.
 *
 * O portal do solicitante é uma superfície separada (`/portal`), com
 * layout próprio — ver `docs/02-gap-analysis.md`, item 9. Ele entra na
 * Fase 2 do roadmap, e o CSS dele será `portal.css`, no mesmo lugar em
 * que o LICITA+ guarda o `publico.css`.
 */
export function App() {
  const [tela, setTela] = useState<Tela>({ nome: 'fila' });

  const chamado = tela.nome === 'chamado' ? CHAMADOS.find((c) => c.id === tela.id) : undefined;

  const semAtribuicao = CHAMADOS.filter((c) => !c.assignedTeam && !c.assignedUser).length;
  const slaEstourando = CHAMADOS.filter(
    (c) => (c.commitments[0]?.remainingSeconds ?? Infinity) < 3600,
  ).length;

  return (
    <div className="casca">
      <Sidebar
        contadores={{
          meus: CHAMADOS.filter((c) => c.assignedUser !== null).length,
          time: CHAMADOS.length,
          semAtribuicao,
          slaEstourando,
        }}
        aoNavegar={() => setTela({ nome: 'fila' })}
      />

      <Cabecalho />

      <main className="conteudo" id="conteudo">
        <div className="conteudo__interno">
          {chamado ? (
            <Chamado chamado={chamado} aoVoltar={() => setTela({ nome: 'fila' })} />
          ) : (
            <Fila chamados={CHAMADOS} aoAbrir={(id) => setTela({ nome: 'chamado', id })} />
          )}
        </div>
      </main>
    </div>
  );
}
