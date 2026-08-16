import type { ReactNode } from 'react';

export interface TimelineEntry {
  id: string;
  time: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  meta?: ReactNode;
}

export function Timeline({ entries, dense = false }: { entries: TimelineEntry[]; dense?: boolean }) {
  return (
    <ol className={`nx-timeline ${dense ? 'is-dense' : ''}`}>
      {entries.map((e) => (
        <li key={e.id} className={`nx-timeline__item nx-timeline__item--${e.tone ?? 'neutral'}`}>
          <span className="nx-timeline__marker">{e.icon}</span>
          <div className="nx-timeline__content">
            <div className="nx-row nx-between nx-gap-3">
              <p className="nx-timeline__title">{e.title}</p>
              <span className="nx-timeline__time nx-mono">{e.time}</span>
            </div>
            {e.description && <p className="nx-timeline__description">{e.description}</p>}
            {e.meta && <div className="nx-timeline__meta">{e.meta}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
