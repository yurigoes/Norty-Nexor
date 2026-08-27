import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, isoDate, monthLabel, startOfMonth } from '../../lib/date';

export interface CalendarDayMeta {
  /** 'free' | 'partial' | 'full' | 'blocked' */
  status?: 'free' | 'partial' | 'full' | 'blocked';
  count?: number;
}

export function Calendar({
  value,
  onChange,
  meta = {},
  minDate,
  initialMonth,
}: {
  value?: string;
  onChange?: (iso: string) => void;
  meta?: Record<string, CalendarDayMeta>;
  minDate?: string;
  initialMonth?: string;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(initialMonth ?? value ?? isoDate(new Date())));

  const days = useMemo(() => {
    const first = new Date(cursor);
    const offset = first.getDay();
    const cells: { iso: string; inMonth: boolean; date: Date }[] = [];
    const start = new Date(first);
    start.setDate(start.getDate() - offset);
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({ iso: isoDate(d), inMonth: d.getMonth() === first.getMonth(), date: d });
    }
    return cells;
  }, [cursor]);

  const today = isoDate(new Date());

  return (
    <div className="nx-calendar">
      <header className="nx-calendar__header">
        <button className="nx-icon-btn" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <span className="nx-calendar__month">{monthLabel(cursor)}</span>
        <button className="nx-icon-btn" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </header>
      <div className="nx-calendar__weekdays">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="nx-calendar__grid">
        {days.map((cell) => {
          const info = meta[cell.iso];
          const disabled = (minDate && cell.iso < minDate) || info?.status === 'blocked';
          return (
            <button
              key={cell.iso}
              className={[
                'nx-calendar__day',
                cell.inMonth ? '' : 'is-outside',
                cell.iso === value ? 'is-selected' : '',
                cell.iso === today ? 'is-today' : '',
                info?.status ? `is-${info.status}` : '',
                disabled ? 'is-disabled' : '',
              ].filter(Boolean).join(' ')}
              disabled={disabled || !onChange}
              onClick={() => onChange?.(cell.iso)}
            >
              <span>{cell.date.getDate()}</span>
              {info?.count ? <span className="nx-calendar__dot" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
