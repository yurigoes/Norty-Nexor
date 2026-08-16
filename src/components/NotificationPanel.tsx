import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, CalendarCheck, Car, DoorOpen, FileText, Gavel, Megaphone, Package,
  UserCheck, Wallet, Wrench,
} from 'lucide-react';
import { useAuthenticated } from '../app/SessionContext';
import { markAllRead, markRead, notificationsFor } from '../services/notifications';
import { resolveArrival } from '../services/visitors';
import type { AppNotification, NotificationKind } from '../data/types';
import { Button, Drawer, EmptyState, useToast } from './ui';
import { timeAgo } from '../lib/date';
import './notifications.css';

const ICONS: Record<NotificationKind, typeof Bell> = {
  visitante_chegou: UserCheck,
  encomenda: Package,
  veiculo: Car,
  aviso: Megaphone,
  boleto: Wallet,
  reserva: CalendarCheck,
  chamado: Wrench,
  ocorrencia: AlertTriangle,
  acesso: DoorOpen,
  autorizacao: FileText,
  assembleia: Gavel,
};

const TONES: Partial<Record<NotificationKind, string>> = {
  visitante_chegou: 'brand',
  encomenda: 'cyan',
  veiculo: 'brand',
  aviso: 'warning',
  boleto: 'success',
  ocorrencia: 'danger',
};

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, condominium, dataVersion } = useAuthenticated();
  const navigate = useNavigate();
  const toast = useToast();

  const items = useMemo(
    () => notificationsFor(user, condominium.id),
    [user, condominium.id, dataVersion],
  );

  const unread = items.filter((n) => !n.read).length;

  const openNotification = (n: AppNotification) => {
    markRead(n.id);
    if (n.link) { onClose(); navigate(n.link); }
  };

  /** Ações inline: a portaria pediu autorização e o morador decide daqui. */
  const decide = (n: AppNotification, approve: boolean) => {
    if (!n.refId) return;
    const visitor = resolveArrival(n.refId, approve, user.name);
    markRead(n.id);
    if (!visitor) return;
    if (approve) toast.success('Entrada liberada', `${visitor.name} foi autorizado na portaria.`);
    else toast.warning('Entrada recusada', `${visitor.name} não foi autorizado.`);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notificações"
      subtitle={unread ? `${unread} não lidas` : 'Tudo em dia'}
      width={430}
      footer={
        <Button variant="ghost" block onClick={() => markAllRead(user, condominium.id)} disabled={!unread}>
          Marcar todas como lidas
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={<Bell size={24} />} title="Nenhuma notificação" description="As novidades do condomínio aparecerão aqui." />
      ) : (
        <ul className="nx-notifications">
          {items.map((n) => {
            const Icon = ICONS[n.kind] ?? Bell;
            const tone = TONES[n.kind] ?? 'neutral';
            return (
              <li key={n.id}>
                <div className={`nx-notification ${n.read ? '' : 'is-unread'}`}>
                  <span className={`nx-notification__icon nx-notification__icon--${tone}`}><Icon size={17} /></span>
                  <div className="nx-stack nx-grow nx-gap-1">
                    <button className="nx-notification__main" onClick={() => openNotification(n)}>
                      <span className="nx-row nx-between nx-gap-2">
                        <span className="nx-notification__title">{n.title}</span>
                        <span className="nx-notification__time">{timeAgo(n.at)}</span>
                      </span>
                      <span className="nx-notification__body">{n.body}</span>
                    </button>
                    {n.actions && !n.read && (
                      <div className="nx-row nx-gap-2" style={{ marginTop: 'var(--space-2)' }}>
                        {n.actions.map((action) => (
                          <Button
                            key={action.id}
                            size="sm"
                            variant={action.tone === 'danger' ? 'secondary' : 'primary'}
                            onClick={() => decide(n, action.id === 'liberar')}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!n.read && <span className="nx-notification__dot" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
