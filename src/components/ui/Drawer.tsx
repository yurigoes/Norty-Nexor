import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  side = 'right',
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'right' | 'bottom';
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="nx-overlay nx-overlay--drawer" role="dialog" aria-modal="true">
      <div className="nx-overlay__backdrop" onClick={onClose} />
      <aside className={`nx-drawer nx-drawer--${side}`} style={side === 'right' ? { width } : undefined}>
        <header className="nx-drawer__header">
          <div className="nx-grow">
            {title && <h2 className="nx-drawer__title">{title}</h2>}
            {subtitle && <p className="nx-drawer__subtitle">{subtitle}</p>}
          </div>
          <button className="nx-icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="nx-drawer__body">{children}</div>
        {footer && <footer className="nx-drawer__footer">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
