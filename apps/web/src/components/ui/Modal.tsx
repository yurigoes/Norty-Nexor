import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  hideClose = false,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  hideClose?: boolean;
  className?: string;
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
    <div className="nx-overlay" role="dialog" aria-modal="true">
      <div className="nx-overlay__backdrop" onClick={onClose} />
      <div className={`nx-modal nx-modal--${size} ${className}`}>
        {(title || !hideClose) && (
          <header className="nx-modal__header">
            <div className="nx-grow">
              {title && <h2 className="nx-modal__title">{title}</h2>}
              {subtitle && <p className="nx-modal__subtitle">{subtitle}</p>}
            </div>
            {!hideClose && (
              <button className="nx-icon-btn" onClick={onClose} aria-label="Fechar">
                <X size={18} />
              </button>
            )}
          </header>
        )}
        <div className="nx-modal__body">{children}</div>
        {footer && <footer className="nx-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="nx-text-muted">{message}</p>
    </Modal>
  );
}
