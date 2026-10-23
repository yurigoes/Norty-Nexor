import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, UserSquare } from 'lucide-react';
import type { DriverListItem, Paginated } from '@nortycar/shared';
import { Alert, Button, Card, Page, PageHeader, StatCard } from '../../components/ui';
import { DataTable, Pagination, SearchInput, type Column, type SortState } from '../../components/table';
import { api } from '../../lib/api';
import { useApi, useDebounced, useQueryState } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { DriverForm, type DriverFormValue } from './DriverForm';
import { CnhBadge } from './CustomerDetailPage';

export function DriversPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useQueryState('q');
  const [cnhWindow, setWindow] = useQueryState('cnh');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ sort: 'name', order: 'asc' });
  const [editing, setEditing] = useState<DriverFormValue | 'new' | null>(null);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<DriverListItem>>('/drivers', {
    q: term, page, pageSize: 25, sort: cnhWindow ? 'cnhExpiresAt' : sort.sort, order: cnhWindow ? 'asc' : sort.order, cnhExpiringDays: cnhWindow || undefined,
  }), [term, page, sort, cnhWindow]);
  const expiring = useApi(() => api.get<Paginated<DriverListItem>>('/drivers', { cnhExpiringDays: 30, pageSize: 1 }), []);
  const expired = useApi(() => api.get<Paginated<DriverListItem>>('/drivers', { cnhExpiringDays: 0, pageSize: 1 }), []);

  // Link direto (?id=) vindo de alertas e da lista de documentos a vencer.
  const directId = params.get('id');
  useEffect(() => {
    if (!directId) return;
    api.get<DriverFormValue>(`/drivers/${directId}`).then((d) => setEditing(d)).catch(() => undefined);
  }, [directId]);
  const close = () => { setEditing(null); if (directId) { params.delete('id'); setParams(params, { replace: true }); } };

  const columns: Column<DriverListItem>[] = [
    { key: 'name', header: 'Motorista', sortable: true, render: (d) => <span className="strong">{d.name}</span> },
    { key: 'cpf', header: 'CPF', render: (d) => <span className="mono small">{d.cpf}</span> },
    { key: 'customer', header: 'Cliente', render: (d) => (d.customer ? <Link to={`/pessoas/clientes/${d.customer.id}`} onClick={(e) => e.stopPropagation()}>{d.customer.name}</Link> : <span className="muted">—</span>) },
    { key: 'cnh', header: 'CNH', render: (d) => `${d.cnhCategory} · ${d.cnhNumber}` },
    { key: 'cnhExpiresAt', header: 'Validade', sortable: true, render: (d) => <CnhBadge date={d.cnhExpiresAt} days={d.cnhDaysLeft} /> },
    { key: 'contact', header: 'Contato', render: (d) => <span className="small">{d.phone ?? d.email ?? '—'}</span> },
  ];

  return (
    <Page>
      <PageHeader title="Motoristas" description="Condutores habilitados. A validade da CNH é acompanhada e gera alertas."
        actions={can('customers.create') && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Novo motorista</Button>} />
      <div className="grid-3">
        <StatCard label="CNH vencida" value={expired.data?.total ?? '—'} tone={expired.data?.total ? 'danger' : undefined} onClick={() => { setWindow('0'); setPage(1); }} />
        <StatCard label="Vencendo em 30 dias" value={expiring.data ? expiring.data.total - (expired.data?.total ?? 0) : '—'} tone="warning" onClick={() => { setWindow('30'); setPage(1); }} />
        <StatCard label="Motoristas ativos" value={list.data && !cnhWindow && !term ? list.data.total : '—'} onClick={() => { setWindow(''); setPage(1); }} />
      </div>
      {cnhWindow && <Alert tone="info" action={<Button size="sm" onClick={() => setWindow('')}>Limpar</Button>}>Mostrando CNHs {cnhWindow === '0' ? 'vencidas' : `que vencem em até ${cnhWindow} dias (inclui vencidas)`}.</Alert>}
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          sort={sort} onSort={(s) => { setSort(s); setPage(1); }}
          onRowClick={can('customers.edit') ? (d) => api.get<DriverFormValue>(`/drivers/${d.id}`).then(setEditing) : undefined}
          toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Nome, CPF ou número da CNH" />}
          empty={{ title: term || cnhWindow ? 'Nenhum motorista com estes filtros' : 'Nenhum motorista cadastrado', icon: UserSquare }}
          footer={list.data && list.data.total > 0 && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {editing && <DriverForm driver={editing === 'new' ? null : editing} onClose={close} onSaved={() => { close(); list.reload(); expiring.reload(); expired.reload(); }} />}
    </Page>
  );
}
