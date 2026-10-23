/* Disponibilidade por período e quadro de agenda da frota (14 dias). */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarRange, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ALLOCATION_KIND_LABEL, type AgendaBlock, type AvailabilityResult, type VehicleListItem } from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, Page, PageHeader, Plate, Tabs } from '../../components/ui';
import { Field, FormGrid, Input, Select } from '../../components/form';
import { DataTable } from '../../components/table';
import { Status } from '../../components/status';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dateTime, fromLocalInput, km, toLocalInput } from '../../lib/format';
import { useBranchFilter } from '../../app/branch-filter';
import { useCategories } from './shared';
import './fleet.css';

type Tab = 'search' | 'board';
const DAY = 86_400_000;

export function AvailabilityPage() {
  const [tab, setTab] = useState<Tab>('search');
  return (
    <Page>
      <PageHeader title="Disponibilidade" description="Consultar não reserva: a reserva só existe quando é confirmada, e o banco impede dois compromissos sobrepostos no mesmo carro." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'search', label: 'Buscar por período' }, { value: 'board', label: 'Agenda da frota' }]} />
      {tab === 'search' ? <SearchTab /> : <BoardTab />}
    </Page>
  );
}

function SearchTab() {
  const navigate = useNavigate();
  const { branchId } = useBranchFilter();
  const categories = useCategories();
  const [start, setStart] = useState(toLocalInput(new Date(Date.now() + DAY)));
  const [end, setEnd] = useState(toLocalInput(new Date(Date.now() + 3 * DAY)));
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState<{ start: string; end: string; categoryId: string } | null>(null);
  const result = useApi(() => api.get<AvailabilityResult>('/availability', {
    startAt: fromLocalInput(query!.start), endAt: fromLocalInput(query!.end), categoryId: query!.categoryId, branchId,
  }), [query, branchId], Boolean(query));
  const invalid = !start || !end || end <= start;

  return (
    <div className="stack">
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); setQuery({ start, end, categoryId }); }}>
          <FormGrid>
            <Field label="Retirada" required className="span-4"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Devolução" required className="span-4" error={end && start && end <= start ? 'Depois da retirada.' : null}><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            <Field label="Categoria" className="span-4"><Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="Todas" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          </FormGrid>
          <div style={{ marginTop: 'var(--space-4)' }}><Button type="submit" variant="primary" icon={Search} disabled={invalid}>Buscar unidades livres</Button></div>
        </form>
      </Card>
      {!query ? <Card><EmptyState icon={CalendarRange} title="Escolha o período" description="Mostramos as unidades livres, já considerando o tempo de preparo entre locações." /></Card>
        : result.error ? <ErrorState message={result.error} onRetry={result.reload} />
        : result.loading && !result.data ? <LoadingBlock /> : result.data && (
          <>
            <div className="row">
              {result.data.byCategory.length ? result.data.byCategory.map((c) => <Badge key={c.categoryId} tone="success">{c.categoryName}: {c.available}</Badge>) : <Badge tone="warning">Nenhuma unidade livre</Badge>}
            </div>
            <Card flush>
              <DataTable<VehicleListItem> rows={result.data.units} onRowClick={(v) => navigate(`/frota/veiculos/${v.id}`)}
                empty={{ title: 'Nenhuma unidade livre no período', description: 'Tente outro período, outra categoria ou outra filial.' }} columns={[
                  { key: 'plate', header: 'Placa', render: (v) => <Plate value={v.plate} /> },
                  { key: 'model', header: 'Veículo', render: (v) => <span className="strong">{v.model.make.name} {v.model.name}</span> },
                  { key: 'cat', header: 'Categoria', render: (v) => v.category.name },
                  { key: 'color', header: 'Cor', render: (v) => v.color },
                  { key: 'branch', header: 'Filial', render: (v) => v.branch.name },
                  { key: 'km', header: 'Quilometragem', align: 'right', render: (v) => km(v.odometerKm) },
                  { key: 'op', header: 'Operacional', render: (v) => <Status kind="operational" value={v.operationalStatus} /> },
                ]} />
            </Card>
            {result.data.units.some((u) => u.operationalStatus !== 'RELEASED') && (
              <Alert tone="info">Unidades em manutenção, vistoria ou aguardando liberação aparecem quando o período é futuro; a retirada exige o veículo liberado.</Alert>
            )}
          </>
        )}
    </div>
  );
}

interface Board { from: string; to: string; vehicles: { vehicle: VehicleListItem; blocks: AgendaBlock[] }[] }

function BoardTab() {
  const { branchId } = useBranchFilter();
  const categories = useCategories();
  const [categoryId, setCategoryId] = useState('');
  const [offset, setOffset] = useState(0);
  const from = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return new Date(d.getTime() + offset * DAY); }, [offset]);
  const to = new Date(from.getTime() + 14 * DAY);
  const board = useApi(() => api.get<Board>('/vehicles/agenda-board', { from: from.toISOString(), to: to.toISOString(), branchId, categoryId }), [from.getTime(), branchId, categoryId]);
  const days = Array.from({ length: 14 }, (_, i) => new Date(from.getTime() + i * DAY));
  const span = 14 * DAY;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - from.getTime()) / span) * 100));
  const today = new Date().toDateString();
  const cols = { gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' };

  return (
    <div className="stack">
      <div className="row-between">
        <div className="row">
          <Button size="sm" icon={ChevronLeft} onClick={() => setOffset(offset - 7)} aria-label="Semana anterior" />
          <Button size="sm" onClick={() => setOffset(0)}>Hoje</Button>
          <Button size="sm" icon={ChevronRight} onClick={() => setOffset(offset + 7)} aria-label="Próxima semana" />
          <span className="small muted">{days[0]!.toLocaleDateString('pt-BR')} a {days[13]!.toLocaleDateString('pt-BR')}</span>
        </div>
        <div className="nc-filters">
          <select className="nc-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="nc-legend">
        {(['RESERVATION', 'CONTRACT', 'MAINTENANCE', 'BLOCK'] as const).map((k) => <span key={k}><i className={`gantt-block--${k.toLowerCase()}`} />{ALLOCATION_KIND_LABEL[k]}</span>)}
        <span><i className="gantt-block__prep" style={{ position: 'static', display: 'inline-block' }} />Preparo</span>
      </div>
      <Card flush>
        {board.loading && !board.data ? <LoadingBlock /> : board.error ? <ErrorState message={board.error} onRetry={board.reload} /> : !board.data?.vehicles.length ? (
          <EmptyState icon={CalendarRange} title="Nenhum veículo em frota" description="Cadastre veículos para ver a agenda." />
        ) : (
          <div className="gantt">
            <div className="gantt__grid">
              <div className="gantt__label" style={{ background: 'var(--surface-sunken)' }}><span className="xsmall muted">Veículo</span></div>
              <div className="gantt__head" style={cols}>
                {days.map((d) => (
                  <div key={d.getTime()} className={`gantt__day${d.toDateString() === today ? ' gantt__day--today' : ''}${[0, 6].includes(d.getDay()) ? ' gantt__day--weekend' : ''}`}>
                    {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} {d.getDate()}
                  </div>
                ))}
              </div>
              {board.data.vehicles.map(({ vehicle: v, blocks }) => (
                <div key={v.id} style={{ display: 'contents' }}>
                  <div className="gantt__label">
                    <Link to={`/frota/veiculos/${v.id}`}><Plate value={v.plate} /></Link>
                    <div className="xsmall muted ellipsis">{v.model.name} · {v.category.name}</div>
                  </div>
                  <div className="gantt__lane" style={cols}>
                    {days.map((d) => <div key={d.getTime()} className={`gantt__cell${[0, 6].includes(d.getDay()) ? ' gantt__cell--weekend' : ''}`} />)}
                    {blocks.map((b) => {
                      const left = pct(new Date(b.startsAt).getTime());
                      const end = pct(new Date(b.endsAt).getTime());
                      const prep = pct(new Date(b.blockedUntil).getTime());
                      return (
                        <span key={b.id}>
                          {prep > end && <span className="gantt-block__prep" style={{ left: `${end}%`, width: `${prep - end}%` }} aria-hidden />}
                          <span className={`gantt-block gantt-block--${b.kind.toLowerCase()}`} style={{ left: `${left}%`, width: `${Math.max(0.8, end - left)}%` }}
                            title={`${ALLOCATION_KIND_LABEL[b.kind]}: ${dateTime(b.startsAt)} a ${dateTime(b.endsAt)}${b.reason ? ` — ${b.reason}` : ''}`}>
                            {ALLOCATION_KIND_LABEL[b.kind]}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
