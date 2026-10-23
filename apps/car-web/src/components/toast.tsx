import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; title: string; message?: string }
interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: Kind, title: string, message?: string) => {
    const id = ++seq;
    setToasts((list) => [...list.slice(-3), { id, kind, title, message }]);
    setTimeout(() => remove(id), kind === 'error' ? 7000 : 4000);
  }, [remove]);
  const api = useMemo<ToastApi>(() => ({
    success: (t, m) => push('success', t, m),
    error: (t, m) => push('error', t, m),
    info: (t, m) => push('info', t, m),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="nc-toasts" role="region" aria-live="polite" aria-label="Mensagens">
        {toasts.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertCircle : Info;
          return (
            <div key={t.id} className={`nc-toast nc-toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
              <Icon aria-hidden />
              <div className="grow">
                <div className="nc-toast__title">{t.title}</div>
                {t.message && <div className="nc-toast__msg">{t.message}</div>}
              </div>
              <button type="button" className="nc-btn nc-btn--ghost nc-btn--icon nc-btn--sm" onClick={() => remove(t.id)} aria-label="Fechar mensagem">
                <X />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast fora do ToastProvider');
  return value;
}
