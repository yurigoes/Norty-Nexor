import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { CUSTOMER_STATUS_LABEL, type CustomerListItem, type Paginated } from '@nortycar/shared';
import { Badge, Button, Card, Page, PageHeader } from '../../components/ui';
import { DataTable, Pagination, SearchInput, type Column, type SortState } from '../../components/table';
import { Status } from '../../components/status';
import { api } from '../../lib/api';
import { useApi, useDebounced, useQueryState } from '../../lib/hooks';
import { date } from '../../lib/format';
import { useSession } from '../../lib/session';
import { CustomerForm } from './CustomerForm';

export function CustomersPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const [q, setQ] = useQueryState('q');
  const [status, setStatus] = useQueryState('situacao');
  const [type, setType] = useQueryState('tipo');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ sort: 'name', order: 'asc' });
  const [creating, setCreating] = useState(false);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<CustomerListItem>>('/customers', { q: term, status, type, page, pageSize: 25, sort: sort.sort, order: sort.order }), [term, status, type, page, sort]);

  const columns: Column<CustomerListItem>[] = [
    { key: 'name', header: 'Cliente', sortable: true, render: (c) => <div><div className="strong">{c.name}</div>{c.tradeName && <div className="xsmall muted">{c.tradeName}</div>}</div> },
    { key: 'type', header: 'Tipo', render: (c) => <Badge>{c.type}</Badge> },
    { key: 'document', header: 'Documento', render: (c) => <span className="mono small">{c.document}</span> },
    { key: 'contact', header: 'Contato', render: (c) => <div className="small">{c.email ?? '—'}<div className="muted">{c.phone ?? ''}</div></div> },
    { key: 'city', header: 'Cidade', sortable: true, render: (c) => [c.city, c.state].filter(Boolean).join(' / ') || '—' },
    { key: 'createdAt', header: 'Cliente desde', sortable: true, render: (c) => date(c.createdAt) },
    { key: 'status', header: 'Situação', render: (c) => <Status kind="customer" value={c.status} /> },
  ];

  return (
    <Page>
      <PageHeader title="Clientes" description="Locatários pessoa física e jurídica. Documentos completos só aparecem para perfis autorizados."
        actions={can('customers.create') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo cliente</Button>} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          sort={sort} onSort={(s) => { setSort(s); setPage(1); }} onRowClick={(c) => navigate(`/pessoas/clientes/${c.id}`)}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Nome, e-mail, CPF/CNPJ ou telefone" />
            <div className="nc-filters">
              <select className="nc-select" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Tipo">
                <option value="">PF e PJ</option><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option>
              </select>
              <select className="nc-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Situação">
                <option value="">Todas as situações</option>
                {Object.entries(CUSTOMER_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </>}
          empty={term || status || type ? { title: 'Nenhum cliente com estes filtros', icon: Users } : {
            title: 'Nenhum cliente cadastrado', icon: Users, description: 'Cadastre o primeiro locatário para criar reservas e contratos.',
            action: can('customers.create') ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo cliente</Button> : undefined,
          }}
          footer={list.data && list.data.total > 0 && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <CustomerForm customer={null} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/pessoas/clientes/${id}`)} />}
    </Page>
  );
}
