/* =========================================================
   Tabela de dados: ordenação, busca, filtros, paginação,
   carregamento, vazio e erro. Linha clicável é navegável
   pelo teclado (Enter).
   ========================================================= */
import { type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button, EmptyState, ErrorState, SkeletonRows } from './ui';
import type { LucideIcon } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  align?: 'right' | 'left';
  width?: number | string;
  hidden?: boolean;
}

export interface SortState {
  sort?: string;
  order?: 'asc' | 'desc';
}

export function DataTable<T extends { id: string }>({
  columns, rows, loading, error, onRetry, onRowClick, sort, onSort, empty, toolbar, footer, rowKey,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  sort?: SortState;
  onSort?: (s: SortState) => void;
  empty?: { title: string; description?: ReactNode; action?: ReactNode; icon?: LucideIcon };
  toolbar?: ReactNode;
  footer?: ReactNode;
  rowKey?: (row: T) => string;
}) {
  const visible = columns.filter((c) => !c.hidden);
  const toggle = (key: string) => {
    if (!onSort) return;
    const order = sort?.sort === key && sort.order === 'asc' ? 'desc' : 'asc';
    onSort({ sort: key, order });
  };
  return (
    <div>
      {toolbar && <div className="nc-table-toolbar">{toolbar}</div>}
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading && !rows ? (
        <SkeletonRows cols={Math.min(visible.length, 5)} />
      ) : !rows?.length ? (
        <EmptyState title={empty?.title ?? 'Nada por aqui ainda'} description={empty?.description} action={empty?.action} icon={empty?.icon} />
      ) : (
        <div className="nc-table-wrap" aria-busy={loading || undefined}>
          <table className="nc-table">
            <thead>
              <tr>
                {visible.map((c) => (
                  <th key={c.key} className={c.align === 'right' ? 'num' : undefined} style={c.width ? { width: c.width } : undefined}
                    aria-sort={sort?.sort === c.key ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sortable && onSort ? (
                      <button type="button" onClick={() => toggle(c.key)}>
                        {c.header}
                        {sort?.sort === c.key && (sort.order === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />)}
                      </button>
                    ) : c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={loading ? { opacity: 0.6 } : undefined}>
              {rows.map((row) => (
                <tr
                  key={rowKey ? rowKey(row) : row.id}
                  className={onRowClick ? 'clickable' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                >
                  {visible.map((c) => <td key={c.key} className={c.align === 'right' ? 'num' : c.key === 'actions' ? 'actions' : undefined}>{c.render(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="nc-table-footer">
      <span className="tnum">{total === 0 ? 'Nenhum registro' : `${from}–${to} de ${total.toLocaleString('pt-BR')}`}</span>
      <div className="nc-pagination">
        <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior" />
        <span className="small tnum">{page} / {pages}</span>
        <Button size="sm" variant="ghost" icon={ChevronRight} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima página" />
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', label = 'Buscar' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <div className="nc-input-group">
      <Search aria-hidden />
      <input className="nc-input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
    </div>
  );
}
