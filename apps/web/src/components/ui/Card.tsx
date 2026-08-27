import type { CSSProperties, ReactNode } from 'react';

export function Card({
  children,
  className = '',
  padding = 'md',
  interactive = false,
  as: Tag = 'section',
  onClick,
  style,
}: {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  as?: 'section' | 'div' | 'article';
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <Tag
      className={`nx-card nx-card--pad-${padding} ${interactive ? 'nx-card--interactive' : ''} ${className}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  compact = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={`nx-card__header ${compact ? 'is-compact' : ''}`}>
      {icon && <span className="nx-card__header-icon">{icon}</span>}
      <div className="nx-grow">
        <h3 className="nx-card__title">{title}</h3>
        {subtitle && <p className="nx-card__subtitle">{subtitle}</p>}
      </div>
      {action && <div className="nx-shrink-0">{action}</div>}
    </header>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`nx-card__body ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <footer className={`nx-card__footer ${className}`}>{children}</footer>;
}
