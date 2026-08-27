import { useMemo, useState } from 'react';
import { Package, PackageCheck, Truck } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { DELIVERY_STATUS_LABEL, deliveries, deliveryTone } from '../../services/deliveries';
import { unitLabel } from '../../services/directory';
import type { Delivery } from '../../data/types';
import {
  Badge, Card, DataTable, EmptyState, PageHeader, Pagination, SearchInput, Select, StatCard,
  type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDateTime, isoDate, timeAgo } from '../../lib/date';
import { number } from '../../lib/format';
import { CARRIERS } from '../../data/seed/random';

const PAGE_SIZE = 20;

export function ManagementDeliveries() {
  const { condominium, dataVersion } = useAuthenticated();
  const today = isoDate(new Date());
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [carrier, setCarrier] = useState('');
  const [page, setPage] = useState(1);

  const all = useMemo(() => deliveries(condominium.id), [condominium.id, dataVersion]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((d) =>
      (!q || [d.carrier, d.trackingCode, unitLabel(d.unitId), d.receivedBy].some((f) => f.toLowerCase().includes(q)))
      && (!status || d.status === status)
      && (!carrier || d.carrier === carrier));
  }, [all, term, status, carrier]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pending = all.filter((d) => d.status === 'recebida' || d.status === 'notificada');

  const columns: Column<Delivery>[] = [
    { key: 'unit', header: 'Unidade', render: (d) => <CellStack title={unitLabel(d.unitId)} meta={`Prateleira ${d.shelf}`} /> },
    { key: 'carrier', header: 'Transportadora', render: (d) => <CellStack title={d.carrier} meta={d.trackingCode} /> },
    { key: 'received', header: 'Recebida', hideOnMobile: true, render: (d) => <CellStack title={formatDateTime(d.receivedAt)} meta={d.receivedBy} /> },
    { key: 'picked', header: 'Retirada', hideOnMobile: true, render: (d) => (d.pickedUpAt ? <CellStack title={formatDateTime(d.pickedUpAt)} meta={d.pickedUpBy} /> : '—') },
    { key: 'status', header: 'Status', align: 'right', render: (d) => <Badge tone={deliveryTone(d.status)} size="sm">{DELIVERY_STATUS_LABEL[d.status]}</Badge> },
  ];

  const avgPickupHours = useMemo(() => {
    const picked = all.filter((d) => d.pickedUpAt);
    if (!picked.length) return 0;
    const total = picked.reduce((s, d) => s + (new Date(d.pickedUpAt!).getTime() - new Date(d.receivedAt).getTime()), 0);
    return Math.round(total / picked.length / 3600000);
  }, [all]);

  return (
    <>
      <PageHeader
        icon={<Package size={22} />}
        title="Encomendas"
        subtitle="Fluxo completo de recebimento e retirada na portaria"
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Aguardando retirada" value={number(pending.length)} icon={<Package size={17} />} tone="warning" />
        <StatCard label="Recebidas hoje" value={number(all.filter((d) => d.receivedAt.slice(0, 10) === today).length)} icon={<Truck size={17} />} tone="gold" />
        <StatCard label="Retiradas hoje" value={number(all.filter((d) => d.pickedUpAt?.slice(0, 10) === today).length)} icon={<PackageCheck size={17} />} tone="success" />
        <StatCard label="Tempo médio de retirada" value={`${avgPickupHours} h`} icon={<Package size={17} />} tone="brand" hint="Da chegada à retirada" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por unidade, transportadora ou código..." />
          <Select
            options={Object.entries(DELIVERY_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="Todos os status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            selectSize="sm"
          />
          <Select
            options={CARRIERS.map((c) => ({ value: c, label: c }))}
            placeholder="Todas as transportadoras"
            value={carrier}
            onChange={(e) => { setCarrier(e.target.value); setPage(1); }}
            selectSize="sm"
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={paged}
          keyOf={(d) => d.id}
          empty={<EmptyState icon={<Package size={24} />} title="Nenhuma encomenda encontrada" description="Ajuste os filtros para ampliar a busca." />}
          mobileCard={(d) => (
            <div className="nx-row nx-gap-3">
              <span className="nx-list__icon nx-list__icon--gold"><Package size={16} /></span>
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{unitLabel(d.unitId)}</span>
                <span className="nx-text-xs nx-text-subtle">{d.carrier} · {timeAgo(d.receivedAt)}</span>
              </div>
              <Badge tone={deliveryTone(d.status)} size="sm">{DELIVERY_STATUS_LABEL[d.status]}</Badge>
            </div>
          )}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>
    </>
  );
}
