import type { ReactNode } from 'react';
import { Spinner } from './Spinner';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Oculta a coluna em telas estreitas — a tabela vira lista de cards no mobile. */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading = false,
  empty,
  onRowClick,
  dense = false,
  className = '',
  /** Renderização alternativa em mobile (cards). Sem isso a tabela rola horizontalmente. */
  mobileCard,
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  dense?: boolean;
  className?: string;
  mobileCard?: (row: T) => ReactNode;
}) {
  if (loading) {
    return (
      <div className="nx-table__state"><Spinner size={22} /><span>Carregando dados...</span></div>
    );
  }

  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros ou cadastre um novo item." />}</>;
  }

  return (
    <div className={`nx-table-wrap ${mobileCard ? 'has-mobile-cards' : ''} ${className}`}>
      <table className={`nx-table ${dense ? 'nx-table--dense' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width, textAlign: c.align ?? 'left' }}
                className={c.hideOnMobile ? 'nx-col-hide-sm' : ''}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={keyOf(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'is-clickable' : ''}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align ?? 'left' }}
                  className={c.hideOnMobile ? 'nx-col-hide-sm' : ''}
                >
                  {c.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {mobileCard && (
        <div className="nx-table__cards">
          {rows.map((row) => (
            <div
              key={keyOf(row)}
              className={`nx-table__card ${onRowClick ? 'is-clickable' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {mobileCard(row)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
