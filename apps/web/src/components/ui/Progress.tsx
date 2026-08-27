export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  size = 'md',
  label,
  showValue = false,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="nx-progress-wrap">
      {(label || showValue) && (
        <div className="nx-row nx-between nx-text-sm">
          {label && <span className="nx-text-muted">{label}</span>}
          {showValue && <span className="nx-semibold nx-nums">{pct.toFixed(0)}%</span>}
        </div>
      )}
      <div className={`nx-progress nx-progress--${size}`}>
        <div className={`nx-progress__fill nx-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
