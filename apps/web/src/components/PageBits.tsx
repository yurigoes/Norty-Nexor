import type { ReactNode } from 'react';
import './page-bits.css';

/** Barra de filtros padrão das listagens. */
export function FilterBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`nx-filterbar ${className}`}>{children}</div>;
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="nx-section-title">
      <div className="nx-grow">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Linha compacta de rótulo + valor, usada em cards e drawers. */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="nx-inforow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Célula de tabela com título e legenda. */
export function CellStack({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <span className="nx-cellstack">
      <span className="nx-cellstack__title">{title}</span>
      {meta && <span className="nx-cellstack__meta">{meta}</span>}
    </span>
  );
}
