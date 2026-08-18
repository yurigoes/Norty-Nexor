import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  tone = 'brand',
  onClick,
  footer,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  trend?: { value: string; direction: 'up' | 'down'; positive?: boolean };
  tone?: 'brand' | 'gold' | 'success' | 'warning' | 'danger' | 'neutral';
  onClick?: () => void;
  footer?: ReactNode;
}) {
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : TrendingDown;
  const trendPositive = trend?.positive ?? trend?.direction === 'up';

  // Valores longos (moeda cheia, por exemplo) reduzem de corpo para não
  // transbordar o cartão em grades de quatro colunas.
  const text = typeof value === 'string' ? value : '';
  const lengthClass = text.length > 15 ? 'is-xlong' : text.length > 11 ? 'is-long' : '';

  return (
    <div
      className={`nx-stat nx-stat--${tone} ${onClick ? 'is-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <div className="nx-row nx-between nx-gap-3">
        <span className="nx-stat__label">{label}</span>
        {icon && <span className="nx-stat__icon">{icon}</span>}
      </div>
      <div className={`nx-stat__value nx-nums ${lengthClass}`}>{value}</div>
      <div className="nx-row nx-gap-2 nx-wrap">
        {trend && (
          <span className={`nx-stat__trend ${trendPositive ? 'is-positive' : 'is-negative'}`}>
            <TrendIcon size={13} />{trend.value}
          </span>
        )}
        {hint && <span className="nx-stat__hint">{hint}</span>}
      </div>
      {footer && <div className="nx-stat__footer">{footer}</div>}
    </div>
  );
}
