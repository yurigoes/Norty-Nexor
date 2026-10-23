/* Manutenção preventiva: planos por km e/ou tempo, com o que vence primeiro em destaque. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge, Plus, Wrench } from 'lucide-react';
import type { MaintenancePlanRow } from '@nortycar/shared';
import { Badge, Button, Card, Page, PageHeader, Plate, Progress, StatCard, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, Select } from '../../components/form';
import { DataTable, type Column } from '../../components/table';
import { Modal } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useQueryState } from '../../lib/hooks';
import { date, int } from '../../lib/format';
import { loadVehicles } from '../../lib/pickers';
import { useSession } from '../../lib/session';
import './operations.css';

const STATE = { OVERDUE: { label: 'Vencida', tone: 'danger' }, DUE_SOON: { label: 'Próxima', tone: 'warning' }, OK: { label: 'Em dia', tone: 'success' }, NO_BASELINE: { label: 'Sem referência', tone: 'neutral' } } as const;

export function MaintenancePlansPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const [vehicle] = useQueryState('veiculo');
  const [state, setState] = useState('');
  const list = useApi(() => api.get<MaintenancePlanRow[]>('/maintenance/plans', { vehicleUnitId: vehicle, state }), [vehicle, state]);
  const all = useApi(() => api.get<MaintenancePlanRow[]>('/maintenance/plans'), []);
  const [editing, setEditing] = useState<MaintenancePlanRow | 'new' | null>(null);
  const count = (s: string) => (all.data ?? []).filter((p) => p.active && p.due.state === s).length;

  const columns: Column<MaintenancePlanRow>[] = [
    { key: 'v', header: 'Veículo', render: (p) => <div className="stack-sm" style={{ gap: 2 }}><Plate value={p.vehicle.plate} /><span className="xsmall muted">{p.vehicle.model.make.name} {p.vehicle.model.name}</span></div> },
    { key: 'n', header: 'Plano', render: (p) => <div><div className="strong">{p.name}</div><div className="xsmall muted">{p.serviceType.name} · {[p.intervalKm ? `a cada ${int(p.intervalKm)} km` : null, p.intervalDays ? `a cada ${p.intervalDays} dias` : null].filter(Boolean).join(' ou ')}</div></div> },
    { key: 'last', header: 'Última', render: (p) => <span className="small">{p.lastDoneAt ? date(p.lastDoneAt) : '—'}{p.lastDoneKm !== null ? ` · ${int(p.lastDoneKm)} km` : ''}</span> },
    { key: 'km', header: 'Km restantes', render: (p) => p.due.kmRemaining === null ? <span className="muted">—</span> : (
      <div className="op-due"><span className={`small ${p.due.kmRemaining <= 0 ? 'text-danger' : ''}`}>{p.due.kmRemaining <= 0 ? `${int(-p.due.kmRemaining)} km além` : `${int(p.due.kmRemaining)} km`}</span>
        {p.intervalKm && <Progress value={100 - (Math.max(0, p.due.kmRemaining) / p.intervalKm) * 100} tone={p.due.kmRemaining <= 0 ? 'danger' : p.due.kmRemaining <= p.alertKmBefore ? 'warning' : 'success'} />}</div>
    ) },
    { key: 'days', header: 'Dias restantes', render: (p) => p.due.daysRemaining === null ? <span className="muted">—</span> : (
      <div className="op-due"><span className={`small ${p.due.daysRemaining <= 0 ? 'text-danger' : ''}`}>{p.due.daysRemaining <= 0 ? `${-p.due.daysRemaining} dia(s) de atraso` : `${p.due.daysRemaining} dia(s) · ${date(p.due.nextDate)}`}</span>
        {p.intervalDays && <Progress value={100 - (Math.max(0, p.due.daysRemaining) / p.intervalDays) * 100} tone={p.due.daysRemaining <= 0 ? 'danger' : p.due.daysRemaining <= p.alertDaysBefore ? 'warning' : 'success'} />}</div>
    ) },
    { key: 's', header: 'Situação', render: (p) => <div className="row" style={{ gap: 4 }}><Badge tone={STATE[p.due.state].tone} dot>{STATE[p.due.state].label}</Badge>{!p.active && <Badge>Inativo</Badge>}{p.blockWhenOverdue && <Badge tone="info">Bloqueia</Badge>}</div> },
    { key: 'actions', header: '', render: (p) => can('maintenance.manage') && (p.due.state === 'OVERDUE' || p.due.state === 'DUE_SOON') ? (
      <Button size="sm" icon={Wrench} onClick={(e) => { e.stopPropagation(); navigate(`/operacao/ordens-servico?novo=1&vehicleUnitId=${p.vehicleUnitId}&description=${encodeURIComponent(`Manutenção preventiva: ${p.name}`)}`); }}>Abrir OS</Button>
    ) : null },
  ];

  return (
    <Page>
      <PageHeader title="Manutenção preventiva" description="Planos por quilometragem e por tempo. Vence pelo que chegar primeiro; o plano pode bloquear o carro vencido."
        actions={can('maintenance.manage') && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Novo plano</Button>} />
      <div className="grid-3">
        <StatCard label="Vencidas" value={count('OVERDUE')} icon={Gauge} tone="danger" />
        <StatCard label="Próximas" value={count('DUE_SOON')} icon={Gauge} tone="warning" />
        <StatCard label="Em dia" value={count('OK')} icon={Gauge} tone="success" />
      </div>
      <Tabs value={state} onChange={setState} tabs={[{ value: '', label: 'Todos' }, { value: 'OVERDUE', label: 'Vencidas' }, { value: 'DUE_SOON', label: 'Próximas' }, { value: 'OK', label: 'Em dia' }, { value: 'NO_BASELINE', label: 'Sem referência' }]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={can('maintenance.manage') ? setEditing : undefined}
          empty={{ title: 'Nenhum plano de manutenção', description: 'Cadastre os planos do fabricante para cada veículo e receba alertas antes do vencimento.', icon: Gauge }} />
      </Card>
      {editing && <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); all.reload(); }} />}
    </Page>
  );
}

function PlanModal({ plan, onClose, onSaved }: { plan: MaintenancePlanRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const types = useApi(() => api.get<{ id: string; name: string; active: boolean }[]>('/maintenance/service-types'), []);
  const [vehicleUnitId, setVehicle] = useState<string | null>(plan?.vehicleUnitId ?? null);
  const [f, setF] = useState({
    serviceTypeId: plan?.serviceTypeId ?? '', name: plan?.name ?? '', intervalKm: plan?.intervalKm?.toString() ?? '', intervalDays: plan?.intervalDays?.toString() ?? '',
    lastDoneAt: plan?.lastDoneAt?.slice(0, 10) ?? '', lastDoneKm: plan?.lastDoneKm?.toString() ?? '', alertKmBefore: String(plan?.alertKmBefore ?? 1000),
    alertDaysBefore: String(plan?.alertDaysBefore ?? 15), blockWhenOverdue: plan?.blockWhenOverdue ?? false, active: plan?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const n = (v: string) => (v === '' ? null : Number(v));
  const numeric = ['intervalKm', 'intervalDays', 'lastDoneKm', 'alertKmBefore', 'alertDaysBefore'];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: numeric.includes(k) ? e.target.value.replace(/\D/g, '') : e.target.value });
  const save = async () => {
    setBusy(true);
    const body = {
      name: f.name, intervalKm: n(f.intervalKm), intervalDays: n(f.intervalDays), lastDoneAt: f.lastDoneAt ? new Date(`${f.lastDoneAt}T12:00:00Z`).toISOString() : null,
      lastDoneKm: n(f.lastDoneKm), alertKmBefore: Number(f.alertKmBefore) || 0, alertDaysBefore: Number(f.alertDaysBefore) || 0, blockWhenOverdue: f.blockWhenOverdue,
    };
    try {
      if (plan) await api.patch(`/maintenance/plans/${plan.id}`, { ...body, active: f.active });
      else await api.post('/maintenance/plans', { ...body, vehicleUnitId, serviceTypeId: f.serviceTypeId, intervalKm: body.intervalKm ?? undefined, intervalDays: body.intervalDays ?? undefined, lastDoneAt: body.lastDoneAt ?? undefined, lastDoneKm: body.lastDoneKm ?? undefined });
      toast.success('Plano salvo');
      onSaved();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={plan ? plan.name : 'Novo plano de manutenção'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.name || (!plan && (!vehicleUnitId || !f.serviceTypeId)) || (!f.intervalKm && !f.intervalDays)} onClick={save}>Salvar</Button></>}>
      <FormGrid>
        {!plan && <Field label="Veículo" required className="span-6"><EntityPicker value={vehicleUnitId} onChange={(v) => setVehicle(v)} load={loadVehicles()} /></Field>}
        {!plan && <Field label="Tipo de serviço" required className="span-6"><Select value={f.serviceTypeId} onChange={set('serviceTypeId')} placeholder="Selecione" options={(types.data ?? []).filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))} /></Field>}
        <Field label="Nome do plano" required className="span-12"><Input value={f.name} onChange={set('name')} placeholder="Ex.: Revisão de 10.000 km" /></Field>
        <Field label="Intervalo em km" className="span-6"><Input inputMode="numeric" value={f.intervalKm} onChange={set('intervalKm')} /></Field>
        <Field label="Intervalo em dias" className="span-6"><Input inputMode="numeric" value={f.intervalDays} onChange={set('intervalDays')} /></Field>
        <Field label="Última realização" className="span-6" hint="Sem data e km, o plano não tem referência para vencer."><Input type="date" value={f.lastDoneAt} onChange={set('lastDoneAt')} /></Field>
        <Field label="Km na última realização" className="span-6"><Input inputMode="numeric" value={f.lastDoneKm} onChange={set('lastDoneKm')} /></Field>
        <Field label="Alertar com antecedência de (km)" className="span-6"><Input inputMode="numeric" value={f.alertKmBefore} onChange={set('alertKmBefore')} /></Field>
        <Field label="Alertar com antecedência de (dias)" className="span-6"><Input inputMode="numeric" value={f.alertDaysBefore} onChange={set('alertDaysBefore')} /></Field>
        <div className="span-12 stack-sm">
          <Checkbox label="Bloquear o veículo para novas locações quando vencer" checked={f.blockWhenOverdue} onChange={(e) => setF({ ...f, blockWhenOverdue: e.target.checked })} />
          {plan && <Checkbox label="Plano ativo" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />}
        </div>
      </FormGrid>
    </Modal>
  );
}
