import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  push: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
} as const;

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${(seq += 1)}`;
    setItems((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    push,
    success: (title, description) => push({ tone: 'success', title, description }),
    error: (title, description) => push({ tone: 'error', title, description }),
    info: (title, description) => push({ tone: 'info', title, description }),
    warning: (title, description) => push({ tone: 'warning', title, description }),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="nx-toasts" role="status" aria-live="polite">
          {items.map((t) => {
            const Icon = ICONS[t.tone];
            return (
              <div key={t.id} className={`nx-toast nx-toast--${t.tone}`}>
                <span className="nx-toast__icon"><Icon size={18} /></span>
                <div className="nx-grow">
                  <p className="nx-toast__title">{t.title}</p>
                  {t.description && <p className="nx-toast__description">{t.description}</p>}
                  {t.action && (
                    <button className="nx-toast__action" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button className="nx-toast__close" onClick={() => dismiss(t.id)} aria-label="Fechar"><X size={14} /></button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}
