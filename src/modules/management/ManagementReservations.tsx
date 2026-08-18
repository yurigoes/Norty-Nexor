import { useMemo, useState } from 'react';
import { CalendarDays, Check, X } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  RESERVATION_STATUS_LABEL, areaName, commonAreas, decideReservation, reservationTone,
  reservations, reservationsOn,
} from '../../services/reservations';
import { unitLabel } from '../../services/directory';
import type { Reservation } from '../../data/types';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, PageHeader, Pagination, SearchInput,
  Select, StatCard, Tabs, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDate, isoDate } from '../../lib/date';
import { currency, number } from '../../lib/format';
import { RankBars } from '../../components/charts/Charts';
import './management.css';

const PAGE_SIZE = 20;

export function ManagementReservations() {
  const { user, condominium, can, dataVersion } = useAuthenticated();
  const toast = useToast();
  const today = isoDate(new Date());
  const canApprove = can('reservations.approve');

  const [tab, setTab] = useState('pendentes');
  const [term, setTerm] = useState('');
  const [areaId, setAreaId] = useState('');
  const [page, setPage] = useState(1);

  const all = useMemo(() => reservations(condominium.id), [condominium.id, dataVersion]);
  const areas = useMemo(() => commonAreas(condominium.id), [condominium.id, dataVersion]);

  const pending = all.filter((r) => r.status === 'pendente');
  const upcoming = all.filter((r) => r.date >= today && r.status === 'confirmada');

  const filtered = useMemo(() => {
    const base = tab === 'pendentes' ? pending : tab === 'proximas' ? upcoming : all;
    const q = term.trim().toLowerCase();
    return base.filter((r) =>
      (!q || [r.residentName, areaName(r.areaId), unitLabel(r.unitId)].some((f) => f.toLowerCase().includes(q)))
      && (!areaId || r.areaId === areaId))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [tab, pending, upcoming, all, term, areaId]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    all.filter((r) => r.status !== 'cancelada' && r.status !== 'recusada')
      .forEach((r) => map.set(areaName(r.areaId), (map.get(areaName(r.areaId)) ?? 0) + 1));
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [all]);

  const decide = (r: Reservation, approve: boolean) => {
    decideReservation(r.id, approve, user.name);
    toast[approve ? 'success' : 'warning'](
      approve ? 'Reserva aprovada' : 'Reserva recusada',
      `${areaName(r.areaId)} · ${formatDate(r.date)} · ${r.slot}`,
    );
  };

  const columns: Column<Reservation>[] = [
    { key: 'area', header: 'Área', render: (r) => <CellStack title={areaName(r.areaId)} meta={r.slot} /> },
    { key: 'date', header: 'Data', render: (r) => <CellStack title={formatDate(r.date)} meta={r.date === today ? 'Hoje' : undefined} /> },
    { key: 'resident', header: 'Solicitante', render: (r) => <CellStack title={r.residentName} meta={unitLabel(r.unitId)} /> },
    { key: 'guests', header: 'Convidados', hideOnMobile: true, align: 'center', render: (r) => number(r.guests) },
    { key: 'fee', header: 'Taxa', hideOnMobile: true, render: (r) => (r.fee ? currency(r.fee) : 'Isenta') },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={reservationTone(r.status)} size="sm">{RESERVATION_STATUS_LABEL[r.status]}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '190px',
      render: (r) => (
        r.status === 'pendente' && canApprove ? (
          <span className="nx-row nx-gap-2 nx-end">
            <Button variant="ghost" size="sm" icon={<X size={15} />} onClick={() => decide(r, false)}>Recusar</Button>
            <Button variant="success" size="sm" icon={<Check size={15} />} onClick={() => decide(r, true)}>Aprovar</Button>
          </span>
        ) : null
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<CalendarDays size={22} />}
        title="Reservas"
        subtitle="Agenda das áreas comuns e aprovações pendentes"
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => { setTab(id); setPage(1); }}
            items={[
              { id: 'pendentes', label: 'Aguardando aprovação', count: pending.length },
              { id: 'proximas', label: 'Próximas confirmadas', count: upcoming.length },
              { id: 'todas', label: 'Todas', count: all.length },
            ]}
          />
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Aguardando aprovação" value={number(pending.length)} icon={<CalendarDays size={17} />} tone="warning" />
        <StatCard label="Reservas hoje" value={number(reservationsOn(condominium.id, today).length)} icon={<CalendarDays size={17} />} tone="gold" />
        <StatCard label="Confirmadas futuras" value={number(upcoming.length)} icon={<Check size={17} />} tone="success" />
        <StatCard
          label="Receita de reservas"
          value={currency(all.filter((r) => r.status === 'confirmada' || r.status === 'concluida').reduce((s, r) => s + r.fee, 0))}
          icon={<CalendarDays size={17} />}
          tone="brand"
        />
      </div>

      <div className="nx-split-wide">
        <Card padding="none">
          <FilterBar>
            <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por morador, unidade ou área..." />
            <Select options={areas.map((a) => ({ value: a.id, label: a.name }))} placeholder="Todas as áreas" value={areaId} onChange={(e) => { setAreaId(e.target.value); setPage(1); }} selectSize="sm" />
          </FilterBar>
          <DataTable
            columns={columns}
            rows={paged}
            keyOf={(r) => r.id}
            empty={<EmptyState icon={<CalendarDays size={24} />} title="Nenhuma reserva encontrada" description="Ajuste os filtros para ampliar a busca." />}
            mobileCard={(r) => (
              <div className="nx-stack nx-gap-3">
                <div className="nx-row nx-between nx-gap-2">
                  <span className="nx-medium">{areaName(r.areaId)}</span>
                  <Badge tone={reservationTone(r.status)} size="sm">{RESERVATION_STATUS_LABEL[r.status]}</Badge>
                </div>
                <span className="nx-text-xs nx-text-subtle">{formatDate(r.date)} · {r.slot} · {r.residentName} ({unitLabel(r.unitId)})</span>
                {r.status === 'pendente' && canApprove && (
                  <div className="nx-row nx-gap-2">
                    <Button variant="secondary" size="sm" block onClick={() => decide(r, false)}>Recusar</Button>
                    <Button variant="success" size="sm" block onClick={() => decide(r, true)}>Aprovar</Button>
                  </div>
                )}
              </div>
            )}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        </Card>

        <Card padding="md">
          <CardHeader title="Áreas mais reservadas" subtitle="Volume histórico por área" />
          <RankBars data={usage} />
        </Card>
      </div>
    </>
  );
}
