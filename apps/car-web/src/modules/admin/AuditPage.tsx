import { useState } from 'react';
import { History } from 'lucide-react';
import type { AuditEntry, Paginated } from '@nortycar/shared';
import { Badge, Card, Page, PageHeader } from '../../components/ui';
import { DataTable, Pagination, type Column } from '../../components/table';
import { Drawer } from '../../components/overlay';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dateTime } from '../../lib/format';

const ACTOR: Record<string, string> = { USER: 'Usuário', PLATFORM: 'Norty', SUPPORT: 'Suporte Norty', CUSTOMER: 'Cliente', SYSTEM: 'Sistema', INTEGRATION: 'Integração', PUBLIC: 'Site' };

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState('');
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const list = useApi(() => api.get<Paginated<AuditEntry>>('/audit', { page, pageSize: 50, entityType, action, actorType }), [page, entityType, action, actorType]);
  const columns: Column<AuditEntry>[] = [
    { key: 'at', header: 'Quando', render: (e) => <span className="nowrap small">{dateTime(e.at)}</span> },
    { key: 'actor', header: 'Quem', render: (e) => <div><div>{e.actorName ?? '—'}</div><div className="xsmall muted">{ACTOR[e.actorType] ?? e.actorType}</div></div> },
    { key: 'action', header: 'Ação', render: (e) => <span className="mono small">{e.action}</span> },
    { key: 'entity', header: 'Registro', render: (e) => <span className="small">{e.entityType}</span> },
    { key: 'reason', header: 'Motivo', render: (e) => <span className="small muted ellipsis" style={{ maxWidth: 260, display: 'inline-block' }}>{e.reason ?? ''}</span> },
    { key: 'kind', header: '', render: (e) => e.actorType === 'SUPPORT' ? <Badge tone="warning">Suporte</Badge> : null },
  ];
  return (
    <Page>
      <PageHeader title="Trilha de auditoria" description="Registros imutáveis das operações relevantes: quem fez, quando, de onde, o antes e o depois." />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setOpen}
          empty={{ title: 'Nenhum registro com estes filtros', icon: History }}
          toolbar={
            <div className="nc-filters">
              <input className="nc-input" placeholder="Ação (ex.: contract.)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filtrar por ação" />
              <input className="nc-input" placeholder="Entidade (ex.: Role)" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} aria-label="Filtrar por entidade" />
              <select className="nc-select" value={actorType} onChange={(e) => { setActorType(e.target.value); setPage(1); }} aria-label="Filtrar por origem">
                <option value="">Todas as origens</option>
                {Object.entries(ACTOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          }
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.action ?? ''} description={open ? `${dateTime(open.at)} · ${open.actorName ?? ''}` : ''} wide>
        {open && (
          <div className="stack">
            <div className="small muted">Registro: {open.entityType} {open.entityId ? <span className="mono">{open.entityId}</span> : null} · IP {open.ip ?? '—'}</div>
            {open.reason && <div><span className="nc-section-title">Motivo</span><p>{open.reason}</p></div>}
            <div className="grid-2">
              <div><span className="nc-section-title">Antes</span><pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-sunken)', padding: 12, borderRadius: 8 }}>{JSON.stringify(open.before ?? null, null, 2)}</pre></div>
              <div><span className="nc-section-title">Depois</span><pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-sunken)', padding: 12, borderRadius: 8 }}>{JSON.stringify(open.after ?? null, null, 2)}</pre></div>
            </div>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
