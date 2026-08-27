export function Skeleton({
  width = '100%',
  height = 14,
  radius = 'var(--radius-sm)',
  className = '',
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  className?: string;
}) {
  return <span className={`nx-skeleton ${className}`} style={{ width, height, borderRadius: radius }} />;
}

export function SkeletonText({ lines = 3, width = '100%' }: { lines?: number; width?: string }) {
  return (
    <span className="nx-stack nx-gap-2" style={{ width }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </span>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="nx-card nx-card--pad-md">
      <div className="nx-stack nx-gap-4">
        <Skeleton width="42%" height={18} />
        <SkeletonText lines={rows} />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="nx-skeleton-table">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="nx-skeleton-table__row">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height={12} width={c === 0 ? '70%' : '45%'} />
          ))}
        </div>
      ))}
    </div>
  );
}
