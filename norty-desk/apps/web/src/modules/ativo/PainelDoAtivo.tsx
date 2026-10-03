import { useEffect, useState } from 'react';
import type { PainelDoAtivo } from '@norty-desk/shared';

import { painelDoAtivo } from '../../api/painel';
import { DesenhoDoPainel } from '../../components/Painel';

/**
 * O painel do equipamento desenhado: uma caixinha por posição, na grade
 * do modelo.
 *
 * Para que serve, numa frase: o chamado diz "a internet da sala 3 caiu",
 * o cadastro diz que a sala 3 vai para a porta 17, e o painel diz que a
 * porta 17 é a nona de cima na segunda fileira. Sem o desenho, o técnico
 * de plantão conta RJ45 com o dedo dentro de um rack escuro.
 *
 * Fica calado quando não há painel: equipamento sem modelo, ou modelo sem
 * estêncil cadastrado. Desenhar uma grade vazia pareceria defeito.
 */
export function PainelDoAtivoCard({ assetId }: { assetId: string }) {
  const [painel, setPainel] = useState<PainelDoAtivo | 'carregando'>('carregando');

  useEffect(() => {
    let vivo = true;
    void painelDoAtivo(assetId)
      .then((p) => {
        if (vivo) setPainel(p);
      })
      .catch(() => {
        if (vivo) setPainel(null);
      });
    return () => {
      vivo = false;
    };
  }, [assetId]);

  if (painel === 'carregando' || painel === null) return null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h2>Painel</h2>
          <p className="suave">
            Como as portas ficam no equipamento, pelo painel do modelo{' '}
            <strong>{painel.model.name}</strong>.
          </p>
        </div>
      </div>

      <div className="card-corpo">
        <DesenhoDoPainel painel={painel} />
      </div>
    </section>
  );
}
