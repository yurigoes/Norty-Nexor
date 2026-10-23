import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ScrollText } from 'lucide-react';
import type { ContractRow } from '@nortycar/shared';
import { Button, Card, Page, PageHeader, Plate, Tabs } from '../../components/ui';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Status } from '../../components/status';
import { api } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, money } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';
import { KindBadge } from './common';

type Tab = 'ACTIVE' | 'PROPOSALS' | 'APPROVED' | 'ENDED' | 'ALL';
const STATUS_BY_TAB: Record<Tab, string | undefined> = { ACTIVE: 'ACTIVE', PROPOSALS: undefined, APPROVED: 'APPROVED', ENDED: 'CLOSED', ALL: undefined };

export function ContractsPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('vehicleUnitId') || params.get('customerId') ? 'ALL' : 'ACTIVE');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const list = useApi(() => {
    const base = { q: term, page, pageSize: 25, branchId, kind, vehicleUnitId: params.get('vehicleUnitId') ?? undefined, customerId: params.get('customerId') ?? undefined };
    if (tab === 'PROPOSALS') {
      // Rascunhos e propostas em análise: duas consultas somadas na mesma lista.
      return Promise.all([
        api.page<ContractRow>('/contracts', { ...base, status: 'DRAFT' }),
        api.page<ContractRow>('/contracts', { ...base, status: 'PENDING_APPROVAL' }),
      ]).then(([a, b]) => ({ ...a, items: [...b.items, ...a.items], total: a.total + b.total }));
    }
    return api.page<ContractRow>('/contracts', { ...base, status: STATUS_BY_TAB[tab] });
  }, [term, page, branchId, tab, kind, params]);

  const columns: Column<ContractRow>[] = [
    { key: 'number', header: 'Contrato', render: (c) => <div><div className="mono strong">{c.number}</div><KindBadge kind={c.kind} /></div> },
    { key: 'customer', header: 'Cliente', render: (c) => c.customer.name },
    { key: 'vehicle', header: 'Veículo', render: (c) => c.currentVehicle ? <div className="row" style={{ gap: 6 }}><Plate value={c.currentVehicle.plate} /><span className="small muted">{c.currentVehicle.model}</span></div> : '—' },
    { key: 'period', header: 'Vigência', render: (c) => <span className="small nowrap">{date(c.startAt)} → {date(c.endAt)}</span> },
    { key: 'value', header: 'Valor', align: 'right', render: (c) => c.kind === 'LONG_TERM' ? <span>{money(c.monthlyAmount)}<span className="xsmall muted">/mês</span></span> : money(c.totalAmount) },
    { key: 'status', header: 'Situação', render: (c) => <Status kind="contract" value={c.status} /> },
  ];

  return (
    <Page>
      <PageHeader title="Contratos" description="Locações por período e contratos mensais, com versões, trocas de veículo e motorista preservadas no histórico."
        actions={can('contracts.create') && <Button variant="primary" icon={Plus} onClick={() => navigate('/locacoes/contratos/novo')}>Novo contrato</Button>} />
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[
        { value: 'ACTIVE', label: 'Em vigor' }, { value: 'PROPOSALS', label: 'Propostas' }, { value: 'APPROVED', label: 'Aguardando entrega' },
        { value: 'ENDED', label: 'Encerrados' }, { value: 'ALL', label: 'Todos' },
      ]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={(c) => navigate(`/locacoes/contratos/${c.id}`)}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Número, cliente ou placa" />
            <select className="nc-select" style={{ width: 200 }} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} aria-label="Tipo de contrato">
              <option value="">Todos os tipos</option><option value="PERIOD">Por período</option><option value="LONG_TERM">Mensal</option>
            </select>
          </>}
          empty={{ title: 'Nenhum contrato aqui', description: 'Contratos por período nascem na retirada de uma reserva; mensais, em "Novo contrato".', icon: ScrollText }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
    </Page>
  );
}
