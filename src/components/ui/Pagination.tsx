import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const numbers: (number | '...')[] = [];
  for (let p = 1; p <= pages; p += 1) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) numbers.push(p);
    else if (numbers[numbers.length - 1] !== '...') numbers.push('...');
  }

  return (
    <div className="nx-pagination">
      <span className="nx-pagination__info">
        <strong className="nx-nums">{from}–{to}</strong> de <strong className="nx-nums">{total.toLocaleString('pt-BR')}</strong>
      </span>
      <div className="nx-row nx-gap-1">
        <button className="nx-pagination__btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </button>
        {numbers.map((n, i) =>
          n === '...' ? (
            <span key={`gap-${i}`} className="nx-pagination__gap">…</span>
          ) : (
            <button
              key={n}
              className={`nx-pagination__btn ${n === page ? 'is-active' : ''}`}
              onClick={() => onPageChange(n)}
            >
              {n}
            </button>
          ),
        )}
        <button className="nx-pagination__btn" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Próxima página">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
