import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`nx-empty ${compact ? 'is-compact' : ''}`}>
      <span className="nx-empty__icon">{icon ?? <Inbox size={compact ? 20 : 26} />}</span>
      <h4 className="nx-empty__title">{title}</h4>
      {description && <p className="nx-empty__description">{description}</p>}
      {action && <div className="nx-empty__action">{action}</div>}
    </div>
  );
}
