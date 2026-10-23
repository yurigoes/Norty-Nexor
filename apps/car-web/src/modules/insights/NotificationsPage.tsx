import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { NotificationItem, Paginated } from '@nortycar/shared';
import { Button, Card, EmptyState, ErrorState, Page, PageHeader, Segmented, SkeletonRows } from '../../components/ui';
import { Pagination } from '../../components/table';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { relative, dateTime } from '../../lib/format';
import './insights.css';

const ICON = { INFO: Info, WARNING: AlertTriangle, CRITICAL: XCircle, SUCCESS: CheckCircle2 };

export function NotificationsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const [page, setPage] = useState(1);
  const list = useApi((signal) => api.get<Paginated<NotificationItem>>('/notifications', { page, pageSize: 30, unread: filter === 'unread' ? true : undefined }, signal), [filter, page]);

  const open = async (n: NotificationItem) => {
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
    if (n.link) navigate(n.link);
    else list.reload();
  };

  return (
    <Page>
      <PageHeader title="Notificações" description="Alertas de vencimentos, prazos, cobranças e operação gerados a partir dos dados reais da empresa."
        actions={<>
          <Segmented label="Filtro" options={[{ value: 'unread', label: 'Não lidas' }, { value: 'all', label: 'Todas' }]} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} />
          <Button icon={CheckCheck} onClick={() => api.post<{ marked: number }>('/notifications/read-all').then((r) => { toast.success(`${r.marked} marcada(s) como lida(s)`); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Marcar todas como lidas</Button>
        </>} />
      <Card flush>
        {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <SkeletonRows cols={2} /> : !list.data?.items.length ? (
          <EmptyState icon={Bell} title={filter === 'unread' ? 'Nada pendente' : 'Nenhuma notificação'} description="Os alertas aparecem aqui quando algo precisa de atenção." />
        ) : (
          <>
            <ul className="nc-list" style={{ margin: 0 }}>
              {list.data.items.map((n) => {
                const Icon = ICON[n.severity];
                return (
                  <li key={n.id} className="notif-item" data-unread={!n.readAt} style={{ cursor: 'pointer' }} tabIndex={0}
                    onClick={() => open(n)} onKeyDown={(e) => e.key === 'Enter' && open(n)}>
                    <span className="notif-item__icon" data-severity={n.severity} aria-hidden><Icon size={16} /></span>
                    <div className="grow">
                      <div className="strong">{n.title}</div>
                      <div className="small">{n.body}</div>
                      <div className="xsmall muted" title={dateTime(n.createdAt)}>{relative(n.createdAt)}{n.readAt ? ' · lida' : ''}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </Page>
  );
}
