import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'cyan';

export function Badge({
  tone = 'neutral',
  children,
  icon,
  dot = false,
  size = 'md',
  className = '',
}: {
  tone?: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span className={`nx-badge nx-badge--${tone} nx-badge--${size} ${className}`}>
      {dot && <span className="nx-badge__dot" />}
      {icon}
      {children}
    </span>
  );
}

/** Indicador de status com ponto pulsante — usado em portões, câmeras e sessões. */
export function StatusDot({ tone = 'success', pulse = false }: { tone?: BadgeTone; pulse?: boolean }) {
  return <span className={`nx-status-dot nx-status-dot--${tone} ${pulse ? 'is-pulse' : ''}`} />;
}
