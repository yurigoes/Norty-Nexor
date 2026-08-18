import { useMemo, useState } from 'react';
import { Car, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { OWNER_KIND_LABEL, VEHICLE_KIND_LABEL, toggleVehicleAuthorization, vehicles } from '../../services/vehicles';
import { unitLabel } from '../../services/directory';
import type { Vehicle } from '../../data/types';
import {
  Badge, Button, Card, DataTable, EmptyState, PageHeader, Pagination, SearchInput, Select,
  StatCard, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { number } from '../../lib/format';

const PAGE_SIZE = 20;

export function ManagementVehicles() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const all = useMemo(() => vehicles(condominium.id), [condominium.id, dataVersion]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((v) =>
      (!q || [v.plate, v.brand, v.model, v.ownerName, v.parkingSpot ?? ''].some((f) => f.toLowerCase().includes(q)))
      && (!kind || v.kind === kind)
      && (!status || (status === 'autorizado' ? v.authorized : !v.authorized)));
  }, [all, term, kind, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<Vehicle>[] = [
    { key: 'plate', header: 'Placa', render: (v) => <span className="nx-mono nx-semibold">{v.plate}</span> },
    { key: 'model', header: 'Veículo', render: (v) => <CellStack title={`${v.brand} ${v.model}`} meta={`${VEHICLE_KIND_LABEL[v.kind]} · ${v.color}`} /> },
    { key: 'owner', header: 'Proprietário', render: (v) => <CellStack title={v.ownerName} meta={OWNER_KIND_LABEL[v.ownerKind]} /> },
    { key: 'unit', header: 'Unidade', hideOnMobile: true, render: (v) => (v.unitId ? unitLabel(v.unitId) : '—') },
    { key: 'spot', header: 'Vaga', hideOnMobile: true, render: (v) => <span className="nx-mono nx-text-sm">{v.parkingSpot ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (v) => <Badge tone={v.authorized ? 'success' : 'danger'} size="sm">{v.authorized ? 'Autorizado' : 'Suspenso'}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '130px',
      render: (v) => (
        <Button
          variant="ghost"
          size="sm"
          icon={v.authorized ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
          onClick={() => {
            toggleVehicleAuthorization(v.id, user.name);
            toast.info(v.authorized ? 'Veículo suspenso' : 'Veículo reativado', `Placa ${v.plate}`);
          }}
        >
          {v.authorized ? 'Suspender' : 'Reativar'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<Car size={22} />}
        title="Veículos"
        subtitle={`${number(all.length)} veículos cadastrados e reconhecidos na entrada da garagem`}
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Total cadastrado" value={number(all.length)} icon={<Car size={17} />} tone="brand" />
        <StatCard label="Carros" value={number(all.filter((v) => v.kind === 'carro').length)} icon={<Car size={17} />} tone="gold" />
        <StatCard label="Motos" value={number(all.filter((v) => v.kind === 'moto').length)} icon={<Car size={17} />} tone="neutral" />
        <StatCard label="Suspensos" value={number(all.filter((v) => !v.authorized).length)} icon={<ShieldOff size={17} />} tone="danger" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por placa, modelo, proprietário ou vaga..." />
          <Select
            options={Object.entries(VEHICLE_KIND_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="Todos os tipos"
            value={kind}
            onChange={(e) => { setKind(e.target.value); setPage(1); }}
            selectSize="sm"
          />
          <Select
            options={[{ value: 'autorizado', label: 'Autorizados' }, { value: 'suspenso', label: 'Suspensos' }]}
            placeholder="Todos os status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            selectSize="sm"
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={paged}
          keyOf={(v) => v.id}
          empty={<EmptyState icon={<Car size={24} />} title="Nenhum veículo encontrado" description="Ajuste os filtros para ampliar a busca." />}
          mobileCard={(v) => (
            <div className="nx-row nx-gap-3">
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium nx-mono">{v.plate}</span>
                <span className="nx-text-xs nx-text-subtle">{v.brand} {v.model} · {v.ownerName}</span>
              </div>
              <Badge tone={v.authorized ? 'success' : 'danger'} size="sm">{v.authorized ? 'OK' : 'Suspenso'}</Badge>
            </div>
          )}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>
    </>
  );
}
