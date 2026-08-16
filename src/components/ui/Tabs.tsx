import type { ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  variant = 'underline',
  className = '',
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}) {
  return (
    <div className={`nx-tabs nx-tabs--${variant} ${className}`} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={value === item.id}
          className={`nx-tabs__tab ${value === item.id ? 'is-active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.count !== undefined && <span className="nx-tabs__count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl({
  items,
  value,
  onChange,
  size = 'md',
}: {
  items: { id: string; label: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`nx-segmented nx-segmented--${size}`}>
      {items.map((item) => (
        <button
          key={item.id}
          className={`nx-segmented__item ${value === item.id ? 'is-active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
