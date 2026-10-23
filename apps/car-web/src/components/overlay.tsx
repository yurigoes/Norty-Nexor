/* Modal, drawer e confirmação. Foco preso dentro, Esc fecha, foco volta ao gatilho. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './ui';
import { Field, Textarea } from './form';

function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    setTimeout(() => (node?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[1] ?? focusables()[0])?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        const first = list[0]!;
        const last = list[list.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, onClose, title, description, children, footer, size }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'lg' | 'xl';
}) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="nc-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`nc-modal${size ? ` nc-modal--${size}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="nc-modal-title">
        <div className="nc-modal__header">
          <div>
            <div className="nc-modal__title" id="nc-modal-title">{title}</div>
            {description && <div className="nc-modal__desc">{description}</div>}
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Fechar" />
        </div>
        <div className="nc-modal__body">{children}</div>
        {footer && <div className="nc-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, description, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="nc-drawer-overlay" onMouseDown={onClose} />
      <div ref={ref} className={`nc-drawer${wide ? ' nc-drawer--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="nc-drawer-title">
        <div className="nc-modal__header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-4)' }}>
          <div>
            <div className="nc-modal__title" id="nc-drawer-title">{title}</div>
            {description && <div className="nc-modal__desc">{description}</div>}
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Fechar" />
        </div>
        <div className="nc-modal__body" style={{ flex: 1, paddingTop: 'var(--space-5)' }}>{children}</div>
        {footer && <div className="nc-modal__footer">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

/* ---------------- Confirmação de operações destrutivas ---------------- */

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  /** Exige motivo por escrito (cancelamentos, estornos, bloqueios). */
  requireReason?: boolean;
  reasonLabel?: string;
}
type ConfirmFn = (options: ConfirmOptions) => Promise<{ confirmed: boolean; reason: string }>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (r: { confirmed: boolean; reason: string }) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const confirm = useCallback<ConfirmFn>((options) => new Promise((resolve) => {
    setReason('');
    setState({ ...options, resolve });
  }), []);
  const close = (confirmed: boolean) => {
    state?.resolve({ confirmed, reason: reason.trim() });
    setState(null);
  };
  const blocked = Boolean(state?.requireReason && reason.trim().length < 3);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        footer={
          <>
            <Button onClick={() => close(false)}>Voltar</Button>
            <Button variant={state?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => close(true)} disabled={blocked} data-autofocus={!state?.requireReason || undefined}>
              {state?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="muted">{state?.message}</div>
          {state?.requireReason && (
            <Field label={state.reasonLabel ?? 'Motivo'} required hint="Fica registrado na trilha de auditoria.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} data-autofocus />
            </Field>
          )}
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm fora do ConfirmProvider');
  return fn;
}
