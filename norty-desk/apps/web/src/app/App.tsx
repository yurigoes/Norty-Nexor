import { useState } from 'react';

import { Chamado } from '../modules/chamado/Chamado';
import { Fila } from '../modules/fila/Fila';
import { CHAMADOS } from '../lib/demonstracao';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

type Tela = { nome: 'fila' } | { nome: 'chamado'; id: string };

/**
 * Casca do aplicativo do agente.
 *
 * O portal do solicitante é uma superfície separada (`/portal`), com
 * layout próprio — ver `docs/02-gap-analysis.md`, item 9. Ele entra na
 * Fase 2 do roadmap.
 */
export function App() {
  const [tela, setTela] = useState<Tela>({ nome: 'fila' });

  const chamado = tela.nome === 'chamado' ? CHAMADOS.find((c) => c.id === tela.id) : undefined;

  return (
    <div className="shell">
      <Sidebar
        atual={tela.nome}
        aoNavegar={() => setTela({ nome: 'fila' })}
        contadores={{
          meus: 4,
          time: CHAMADOS.length,
          semAtribuicao: CHAMADOS.filter((c) => !c.assignedTeam && !c.assignedUser).length,
          slaEstourando: CHAMADOS.filter(
            (c) => (c.commitments[0]?.remainingSeconds ?? Infinity) < 3600,
          ).length,
        }}
      />
      <Topbar />
      <main className="conteudo">
        {chamado ? (
          <Chamado chamado={chamado} aoVoltar={() => setTela({ nome: 'fila' })} />
        ) : (
          <Fila chamados={CHAMADOS} aoAbrir={(id) => setTela({ nome: 'chamado', id })} />
        )}
      </main>
    </div>
  );
}
