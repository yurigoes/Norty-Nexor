import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { markAllRead, markRead, notificationsFor } from '../../services/notifications';
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from '../../components/ui';
import { formatDateTime, timeAgo } from '../../lib/date';

const KIND_LABEL: Record<string, string> = {
  visitante_chegou: 'Visitante',
  encomenda: 'Encomenda',
  veiculo: 'Veículo',
  aviso: 'Comunicado',
  boleto: 'Financeiro',
  reserva: 'Reserva',
  chamado: 'Chamado',
  ocorrencia: 'Ocorrência',
  acesso: 'Acesso',
  autorizacao: 'Autorização',
  assembleia: 'Assembleia',
  servico: 'Serviço',
};

export function NotificationsPage() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const navigate = useNavigate();
  const [tab, setTab] = useState('todas');

  const all = useMemo(() => notificationsFor(user, condominium.id), [user, condominium.id, dataVersion]);
  const unread = all.filter((n) => !n.read);
  const rows = tab === 'todas' ? all : unread;

  return (
    <>
      <PageHeader
        icon={<Bell size={22} />}
        title="Notificações"
        subtitle="Tudo o que aconteceu no condomínio relacionado a você"
        actions={
          <Button
            variant="secondary"
            icon={<CheckCheck size={17} />}
            disabled={unread.length === 0}
            onClick={() => markAllRead(user, condominium.id)}
          >
            Marcar todas como lidas
          </Button>
        }
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'todas', label: 'Todas', count: all.length },
              { id: 'nao_lidas', label: 'Não lidas', count: unread.length },
            ]}
          />
        }
      />

      {rows.length === 0 ? (
        <Card padding="md">
          <EmptyState icon={<Bell size={24} />} title="Nenhuma notificação" description="Você está em dia — nada pendente por aqui." />
        </Card>
      ) : (
        <div className="nx-stack nx-gap-2">
          {rows.map((n) => (
            <Card key={n.id} padding="md" interactive onClick={() => { markRead(n.id); if (n.link) navigate(n.link); }}>
              <div className="nx-row nx-between nx-gap-3 nx-wrap">
                <div className="nx-row nx-gap-3 nx-grow">
                  {!n.read && <span className="nx-status-dot nx-status-dot--brand" />}
                  <div className="nx-stack nx-gap-1 nx-grow">
                    <span className="nx-row nx-gap-2 nx-wrap">
                      <strong>{n.title}</strong>
                      <Badge tone="neutral" size="sm">{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                    </span>
                    <span className="nx-text-sm nx-text-muted">{n.body}</span>
                  </div>
                </div>
                <span className="nx-stack" style={{ alignItems: 'flex-end' }}>
                  <span className="nx-text-xs nx-text-muted">{timeAgo(n.at)}</span>
                  <span className="nx-text-2xs nx-text-subtle">{formatDateTime(n.at)}</span>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
