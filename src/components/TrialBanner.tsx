import { FlaskConical } from 'lucide-react';
import { getTrialInfo, TRIAL_DAYS } from '../data/db';
import './trial.css';

/**
 * Indicador da janela de teste de 30 dias definida para esta fase.
 * O contador é informativo: nada é bloqueado durante a demonstração.
 */
export function TrialBanner() {
  const trial = getTrialInfo();
  const pct = Math.min(100, (trial.daysUsed / TRIAL_DAYS) * 100);

  return (
    <div className="nx-trial" title={`Ambiente de demonstração · ${trial.daysLeft} de ${TRIAL_DAYS} dias restantes`}>
      <div className="nx-row nx-gap-2">
        <FlaskConical size={13} />
        <span className="nx-trial__label nx-grow">Demonstração</span>
        <span className="nx-trial__meta">
          {trial.expired ? 'concluída' : `${trial.daysLeft}/${TRIAL_DAYS} dias`}
        </span>
      </div>
      <div className="nx-trial__bar"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
