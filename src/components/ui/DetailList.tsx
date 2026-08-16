import type { ReactNode } from 'react';

export function DetailList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl className={`nx-details nx-details--${columns}`}>
      {items.map((item) => (
        <div key={item.label} className="nx-details__item">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
