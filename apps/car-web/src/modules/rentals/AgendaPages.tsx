/* Retiradas, devoluções, renovações e a agenda semanal do balcão. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, KeyRound, RefreshCw, Undo2 } from 'lucide-react';
import type { AgendaItem, RentalAgenda } from '@nortycar/shared';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, Page, PageHeader, Plate } from '../../components/ui';
import { DataTable, type Column } from '../../components/table';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dateTime, money } from '../../lib/format';
import { useBranchFilter } from '../../app/branch-filter';
import './agenda.css';

function useAgenda(from?: Date, to?: Date, renewalDays?: number) {
  const { branchId } = useBranchFilter();
  return useApi(() => api.get<RentalAgenda>('/rentals/agenda', { from: from?.toISOString(), to: to?.toISOString(), branchId, renewalDays }), [branchId, from?.getTime(), to?.getTime(), renewalDays]);
}

const vehicleCell = (i: AgendaItem) => (i.vehicle ? <Plate value={i.vehicle.plate} /> : <span className="muted small">{i.category ?? 'A definir'}</span>);
const when = (i: AgendaItem) => <span className="nowrap">{dateTime(i.at)} {i.late && <Badge tone="danger">Atrasada</Badge>}</span>;

export function PickupsPage() {
  const navigate = useNavigate();
  // Horizonte fixado na montagem: recalcular a cada render refaria a consulta sem parar.
  const [until] = useState(() => new Date(Date.now() + 2 * 86_400_000));
  const agenda = useAgenda(undefined, until);
  const columns: Column<AgendaItem>[] = [
    { key: 'at', header: 'Retirada', render: when },
    { key: 'code', header: 'Origem', render: (i) => <div><span className="mono strong">{i.code}</span><div className="xsmall muted">{i.type === 'reservation' ? 'Reserva confirmada' : 'Contrato aprovado'}</div></div> },
    { key: 'customer', header: 'Cliente', render: (i) => i.customer.name },
    { key: 'vehicle', header: 'Veículo', render: vehicleCell },
    { key: 'pending', header: 'Pendências', render: (i) => {
      if (i.type === 'reservation') return <Badge tone="info">Gerar contrato</Badge>;
      const p = i.pendencies;
      if (!p) return null;
      const list = [!p.deliveryInspectionId && 'Vistoria', !p.depositOk && 'Caução', !p.cnhOk && 'CNH'].filter(Boolean) as string[];
      return list.length ? <div className="row" style={{ gap: 4 }}>{list.map((l) => <Badge key={l} tone="warning">{l}</Badge>)}</div> : <Badge tone="success">Pronto</Badge>;
    } },
  ];
  return (
    <Page>
      <PageHeader title="Retiradas" description="Reservas confirmadas e contratos aprovados com retirada até depois de amanhã, incluindo as atrasadas." />
      <Card flush>
        <DataTable columns={columns} rows={agenda.data?.pickups} loading={agenda.loading} error={agenda.error} onRetry={agenda.reload} rowKey={(i) => `${i.type}-${i.id}`}
          onRowClick={(i) => navigate(i.type === 'reservation' ? `/locacoes/reservas?id=${i.id}` : `/locacoes/contratos/${i.id}`)}
          empty={{ title: 'Nenhuma retirada prevista', icon: KeyRound }} />
      </Card>
    </Page>
  );
}

export function ReturnsPage() {
  const navigate = useNavigate();
  const [until] = useState(() => new Date(Date.now() + 2 * 86_400_000));
  const agenda = useAgenda(undefined, until);
  const columns: Column<AgendaItem>[] = [
    { key: 'at', header: 'Devolução prevista', render: when },
    { key: 'code', header: 'Contrato', render: (i) => <span className="mono strong">{i.code}</span> },
    { key: 'customer', header: 'Cliente', render: (i) => i.customer.name },
    { key: 'vehicle', header: 'Veículo', render: vehicleCell },
  ];
  return (
    <Page>
      <PageHeader title="Devoluções" description="Contratos em vigor com devolução prevista até depois de amanhã e os já atrasados. Encerre pelo contrato, após a vistoria de devolução." />
      <Card flush>
        <DataTable columns={columns} rows={agenda.data?.returns} loading={agenda.loading} error={agenda.error} onRetry={agenda.reload}
          onRowClick={(i) => navigate(`/locacoes/contratos/${i.id}`)} empty={{ title: 'Nenhuma devolução prevista', icon: Undo2 }} />
      </Card>
    </Page>
  );
}

export function RenewalsPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(60);
  const agenda = useAgenda(undefined, undefined, days);
  const columns: Column<AgendaItem>[] = [
    { key: 'at', header: 'Termina em', render: (i) => dateTime(i.at) },
    { key: 'code', header: 'Contrato', render: (i) => <span className="mono strong">{i.code}</span> },
    { key: 'customer', header: 'Cliente', render: (i) => i.customer.name },
    { key: 'vehicle', header: 'Veículo', render: vehicleCell },
    { key: 'monthly', header: 'Mensalidade', align: 'right', render: (i) => money(i.monthlyAmount ?? null) },
  ];
  return (
    <Page>
      <PageHeader title="Renovações" description="Contratos mensais perto do fim. A renovação cria uma nova proposta ligada ao contrato atual."
        actions={<select className="nc-select" style={{ width: 180 }} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Horizonte">
          {[30, 60, 90, 180].map((d) => <option key={d} value={d}>Próximos {d} dias</option>)}
        </select>} />
      <Card flush>
        <DataTable columns={columns} rows={agenda.data?.renewals} loading={agenda.loading} error={agenda.error} onRetry={agenda.reload}
          onRowClick={(i) => navigate(`/locacoes/contratos/${i.id}`)} empty={{ title: 'Nenhum contrato vencendo no período', icon: RefreshCw }} />
      </Card>
    </Page>
  );
}

/** Semana começando na segunda-feira, em horário de Brasília. */
function weekStart(offset: number): Date {
  const now = new Date(Date.now() - 3 * 3_600_000);
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + offset * 7, 3));
}

export function AgendaPage() {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const from = useMemo(() => weekStart(offset), [offset]);
  const to = useMemo(() => new Date(from.getTime() + 7 * 86_400_000 - 1), [from]);
  const agenda = useAgenda(from, to);
  const days = Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * 86_400_000));
  const dayKey = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(d));
  const events = useMemo(() => {
    const map = new Map<string, { kind: 'pickup' | 'return'; item: AgendaItem }[]>();
    for (const p of agenda.data?.pickups ?? []) if (new Date(p.at) >= from) (map.get(dayKey(p.at)) ?? map.set(dayKey(p.at), []).get(dayKey(p.at))!).push({ kind: 'pickup', item: p });
    for (const r of agenda.data?.returns ?? []) if (new Date(r.at) >= from) (map.get(dayKey(r.at)) ?? map.set(dayKey(r.at), []).get(dayKey(r.at))!).push({ kind: 'return', item: r });
    for (const list of map.values()) list.sort((a, b) => new Date(a.item.at).getTime() - new Date(b.item.at).getTime());
    return map;
  }, [agenda.data, from]);
  const fmtDay = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' });
  const fmtTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const today = dayKey(new Date());

  return (
    <Page>
      <PageHeader title="Agenda" description="Retiradas e devoluções da semana."
        actions={<div className="row">
          <Button icon={ChevronLeft} onClick={() => setOffset(offset - 1)} aria-label="Semana anterior" />
          <Button onClick={() => setOffset(0)}>Esta semana</Button>
          <Button icon={ChevronRight} onClick={() => setOffset(offset + 1)} aria-label="Próxima semana" />
        </div>} />
      {agenda.error ? <ErrorState message={agenda.error} onRetry={agenda.reload} /> : agenda.loading && !agenda.data ? <LoadingBlock /> : (
        <div className="agenda-week">
          {days.map((d) => {
            const list = events.get(dayKey(d)) ?? [];
            return (
              <section key={d.toISOString()} className="agenda-day nc-card" data-today={dayKey(d) === today}>
                <header>{fmtDay.format(d)}</header>
                {!list.length ? <span className="xsmall subtle">Sem movimentos</span> : list.map(({ kind, item }) => (
                  <button key={`${kind}-${item.id}`} type="button" className="agenda-event" data-kind={kind}
                    onClick={() => navigate(item.type === 'reservation' ? `/locacoes/reservas?id=${item.id}` : `/locacoes/contratos/${item.id}`)}>
                    <span className="xsmall strong">{fmtTime.format(new Date(item.at))} · {kind === 'pickup' ? 'Retirada' : 'Devolução'}</span>
                    <span className="small ellipsis">{item.customer.name}</span>
                    <span className="xsmall muted">{item.vehicle ? item.vehicle.plate : item.code}</span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      )}
      {agenda.data && !agenda.data.pickups.length && !agenda.data.returns.length && <EmptyState icon={CalendarClock} title="Semana sem retiradas ou devoluções" />}
    </Page>
  );
}
