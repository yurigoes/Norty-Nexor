import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Plus } from 'lucide-react';
import { COMMERCIAL_STATUS_LABEL, OPERATIONAL_STATUS_LABEL, type Paginated, type VehicleListItem } from '@nortycar/shared';
import { Button, Card, Page, PageHeader, Plate } from '../../components/ui';
import { DataTable, Pagination, SearchInput, type Column, type SortState } from '../../components/table';
import { Status } from '../../components/status';
import { api } from '../../lib/api';
import { useApi, useDebounced, useQueryState } from '../../lib/hooks';
import { km } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';
import { useCategories } from './shared';
import { VehicleForm } from './VehicleForm';

export function VehiclesPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [q, setQ] = useQueryState('q');
  const [categoryId, setCategory] = useQueryState('categoria');
  const [commercial, setCommercial] = useQueryState('comercial');
  const [operational, setOperational] = useQueryState('operacional');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ sort: 'plate', order: 'asc' });
  const [creating, setCreating] = useState(false);
  const term = useDebounced(q);
  const categories = useCategories();
  const list = useApi(() => api.get<Paginated<VehicleListItem>>('/vehicles', {
    q: term, branchId, categoryId, commercialStatus: commercial, operationalStatus: operational, page, pageSize: 25, sort: sort.sort, order: sort.order,
    includeSold: commercial === 'SOLD' ? true : undefined,
  }), [term, branchId, categoryId, commercial, operational, page, sort]);

  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  const columns: Column<VehicleListItem>[] = [
    { key: 'plate', header: 'Placa', sortable: true, render: (v) => <Plate value={v.plate} /> },
    { key: 'model', header: 'Veículo', render: (v) => <div><div className="strong">{v.model.make.name} {v.model.name}{v.version ? ` ${v.version.name}` : ''}</div><div className="xsmall muted">{v.yearManufacture}/{v.yearModel} · {v.color}</div></div> },
    { key: 'internalCode', header: 'Código', sortable: true, render: (v) => <span className="mono small nowrap">{v.internalCode}</span> },
    { key: 'category', header: 'Categoria', render: (v) => v.category.name },
    { key: 'branch', header: 'Filial', render: (v) => <span className="small">{v.branch.name}</span> },
    { key: 'odometerKm', header: 'Quilometragem', sortable: true, align: 'right', render: (v) => km(v.odometerKm) },
    { key: 'commercial', header: 'Comercial', render: (v) => <Status kind="commercial" value={v.commercialStatus} /> },
    { key: 'operational', header: 'Operacional', render: (v) => <Status kind="operational" value={v.operationalStatus} /> },
  ];

  return (
    <Page>
      <PageHeader title="Veículos" description="Unidades físicas da frota, com situação comercial e operacional separadas."
        actions={can('fleet.create') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Cadastrar veículo</Button>} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          sort={sort} onSort={(s) => { setSort(s); setPage(1); }} onRowClick={(v) => navigate(`/frota/veiculos/${v.id}`)}
          toolbar={
            <>
              <SearchInput value={q} onChange={reset(setQ)} placeholder="Placa, código, RENAVAM, chassi ou modelo" />
              <div className="nc-filters">
                <select className="nc-select" value={categoryId} onChange={(e) => reset(setCategory)(e.target.value)} aria-label="Categoria">
                  <option value="">Todas as categorias</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="nc-select" value={commercial} onChange={(e) => reset(setCommercial)(e.target.value)} aria-label="Situação comercial">
                  <option value="">Situação comercial</option>
                  {Object.entries(COMMERCIAL_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <select className="nc-select" value={operational} onChange={(e) => reset(setOperational)(e.target.value)} aria-label="Situação operacional">
                  <option value="">Situação operacional</option>
                  {Object.entries(OPERATIONAL_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            </>
          }
          empty={term || categoryId || commercial || operational
            ? { title: 'Nenhum veículo com estes filtros', icon: Car }
            : { title: 'Nenhum veículo cadastrado', description: 'Cadastre a primeira unidade da frota para começar a reservar e locar.', icon: Car,
                action: can('fleet.create') ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Cadastrar veículo</Button> : undefined }}
          footer={list.data && list.data.total > 0 && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <VehicleForm vehicle={null} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); navigate(`/frota/veiculos/${id}`); }} />}
    </Page>
  );
}
