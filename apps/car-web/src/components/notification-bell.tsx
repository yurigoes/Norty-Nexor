import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

/** Sino com contagem de não lidas. Atualiza a cada minuto e ao trocar de contexto. */
export function NotificationBell({ to = '/notificacoes' }: { to?: string }) {
  const navigate = useNavigate();
  const { version } = useSession();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api.get<{ unread: number }>('/notifications/unread-count').then((r) => alive && setCount(r.unread)).catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [version]);
  return (
    <button type="button" className="nc-btn nc-btn--ghost nc-btn--icon" style={{ position: 'relative' }} onClick={() => navigate(to)}
      aria-label={count ? `Notificações: ${count} não lidas` : 'Notificações'}>
      <Bell aria-hidden />
      {count > 0 && <span className="badge-count" aria-hidden>{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
