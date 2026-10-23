import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Plus } from 'lucide-react';
import { INSPECTION_TYPE_LABEL, type InspectionListItem, type InspectionType, type Paginated } from '@nortycar/shared';
import { Badge, Button, Card, Page, PageHeader, Plate, Tabs } from '../../components/ui';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Status } from '../../components/status';
import { api } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { dateTime, km } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';

type Tab = '' | 'DRAFT' | 'COMPLETED' | 'APPROVED';

export function InspectionsPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [tab, setTab] = useState<Tab>('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<InspectionListItem>>('/inspections', { page, pageSize: 25, status: tab, type, q: term, branchId }), [page, tab, type, term, branchId]);

  const columns: Column<InspectionListItem>[] = [
    { key: 'number', header: 'Vistoria', render: (i) => <div><div className="strong mono">{i.number}</div><div className="xsmall muted">{INSPECTION_TYPE_LABEL[i.type]}</div></div> },
    { key: 'vehicle', header: 'Veículo', render: (i) => <div className="stack-sm" style={{ gap: 2 }}><Plate value={i.vehicle.plate} /><span className="xsmall muted">{i.vehicle.model.make.name} {i.vehicle.model.name}</span></div> },
    { key: 'contract', header: 'Contrato', render: (i) => i.contract ? <span className="mono small">{i.contract.number}</span> : <span className="muted">—</span> },
    { key: 'km', header: 'Quilometragem', align: 'right', render: (i) => km(i.odometerKm) },
    { key: 'issues', header: 'Ressalvas', render: (i) => (
      <div className="row" style={{ gap: 4 }}>
        {i.issues > 0 && <Badge tone="warning">{i.issues} item(ns)</Badge>}
        {i._count.damages > 0 && <Badge tone="danger">{i._count.damages} avaria(s)</Badge>}
        {!i.issues && !i._count.damages && <span className="muted small">Nenhuma</span>}
        <span className="xsmall muted">{i._count.photos} foto(s)</span>
      </div>
    ) },
    { key: 'date', header: 'Data', render: (i) => <span className="small nowrap">{dateTime(i.completedAt ?? i.startedAt)}</span> },
    { key: 'status', header: 'Situação', render: (i) => <div className="row" style={{ gap: 4 }}><Status kind="inspection" value={i.status} />{i.visibleToCustomer && <Badge tone="info">No portal</Badge>}</div> },
  ];

  return (
    <Page>
      <PageHeader title="Vistorias" description="Entrega, devolução, troca de motorista e vistorias periódicas, com fotos e mapa de avarias."
        actions={can('inspections.perform') && <Button variant="primary" icon={Plus} onClick={() => navigate('/operacao/vistorias/nova')}>Nova vistoria</Button>} />
      <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[
        { value: '', label: 'Todas' }, { value: 'DRAFT', label: 'Em preenchimento' }, { value: 'COMPLETED', label: 'Concluídas' }, { value: 'APPROVED', label: 'Aprovadas' },
      ]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={(i) => navigate(i.status === 'DRAFT' ? `/operacao/vistorias/nova?id=${i.id}` : `/operacao/vistorias/${i.id}`)}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Placa, número ou contrato" />
            <select className="nc-select" style={{ width: 'auto' }} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Tipo de vistoria">
              <option value="">Todos os tipos</option>
              {(Object.keys(INSPECTION_TYPE_LABEL) as InspectionType[]).map((t) => <option key={t} value={t}>{INSPECTION_TYPE_LABEL[t]}</option>)}
            </select>
          </>}
          empty={{ title: 'Nenhuma vistoria encontrada', description: 'As vistorias de entrega e devolução aparecem aqui, junto com as periódicas.', icon: ClipboardCheck }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
    </Page>
  );
}
