import { ROTULO_PROJETO_STATUS, type ProjectStatus } from '@norty-desk/shared';

const CLASSE: Record<ProjectStatus, string> = {
  PLANEJADO: '-neutro',
  EM_ANDAMENTO: '-info',
  PAUSADO: '-aviso',
  CONCLUIDO: '-sucesso',
  CANCELADO: '-contorno',
};

export function SeloDoProjeto({ status }: { status: ProjectStatus }) {
  return <span className={`selo ${CLASSE[status]}`}>{ROTULO_PROJETO_STATUS[status]}</span>;
}

/** Barra de andamento com o número ao lado. */
export function Progresso({ valor }: { valor: number }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={`${v}%`}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--borda, #e5e7eb)', overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: v === 100 ? 'var(--sucesso, #16a34a)' : 'var(--primaria, #2563eb)' }} />
      </div>
      <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)', minWidth: 34, textAlign: 'right' }}>{v}%</span>
    </div>
  );
}

/** Minutos como "3h20" ou "45min". */
export function horas(minutos: number | null | undefined): string {
  if (!minutos) return '0h';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m}min`;
}
