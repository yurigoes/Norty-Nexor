/* Pneus com controle individual: instalação, rodízio, reparo, retirada e descarte. */
import { useState } from 'react';
import { CircleDot, Plus } from 'lucide-react';
import { TIRE_POSITION_LABEL, type Paginated, type TireEventRow, type TirePosition, type TireRow } from '@nortycar/shared';
import { Button, Card, KeyValue, LoadingBlock, Page, PageHeader, Plate, Timeline } from '../../components/ui';
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Drawer, Modal } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { dateTime, int, km, money } from '../../lib/format';
import { loadVehicles } from '../../lib/pickers';
import { useSession } from '../../lib/session';

const POSITIONS = Object.keys(TIRE_POSITION_LABEL) as TirePosition[];
const EVENT_LABEL = { INSTALL: 'Instalação', ROTATE: 'Rodízio', REPAIR: 'Reparo', REMOVE: 'Retirada', DISCARD: 'Descarte' } as const;
type EventType = keyof typeof EVENT_LABEL;

export function TiresPage() {
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<TireRow>>('/tires', { q: term, status, page, pageSize: 25 }), [term, status, page]);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const columns: Column<TireRow>[] = [
    { key: 'c', header: 'Pneu', render: (t) => <div><div className="strong mono">{t.code}</div><div className="xsmall muted">{t.brand} {t.model ?? ''} · {t.size}</div></div> },
    { key: 'v', header: 'Veículo / posição', render: (t) => t.vehicle ? <div className="row" style={{ gap: 6 }}><Plate value={t.vehicle.plate} /><span className="small">{t.position ? TIRE_POSITION_LABEL[t.position] : ''}</span></div> : <span className="muted">—</span> },
    { key: 'km', header: 'Km rodados', align: 'right', render: (t) => km(t.kmDriven) },
    { key: 'cost', header: 'Custo total', align: 'right', render: (t) => money(t.totalCost) },
    { key: 'cpk', header: 'Custo por km', align: 'right', render: (t) => t.costPerKm === null ? <span className="muted">—</span> : `R$ ${t.costPerKm.toFixed(4).replace('.', ',')}` },
    { key: 's', header: 'Situação', render: (t) => <Status kind="tire" value={t.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Pneus" description="Cada pneu acumula a quilometragem de todas as instalações; o custo por km inclui compra e reparos."
        actions={can('maintenance.manage') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo pneu</Button>} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(t) => setOpen(t.id)}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Código, marca ou medida" />
            <select className="nc-select" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Situação">
              <option value="">Todas</option><option value="STOCK">Em estoque</option><option value="INSTALLED">Instalados</option><option value="REMOVED">Retirados</option><option value="DISCARDED">Descartados</option>
            </select>
          </>}
          empty={{ title: 'Nenhum pneu cadastrado', icon: CircleDot }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <NewTireModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); list.reload(); }} />}
      {open && <TireDrawer id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </Page>
  );
}

function NewTireModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ code: '', brand: '', model: '', size: '', dot: '' });
  const [cost, setCost] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Novo pneu"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.code || !f.brand || f.size.length < 4} onClick={async () => {
        setBusy(true);
        try { await api.post('/tires', { code: f.code, brand: f.brand, model: f.model || undefined, size: f.size, dot: f.dot || undefined, cost: cost === '' ? undefined : cost }); toast.success('Pneu cadastrado'); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Identificação" required className="span-6" hint="Número de fogo ou etiqueta."><Input value={f.code} onChange={set('code')} /></Field>
        <Field label="Medida" required className="span-6"><Input value={f.size} onChange={set('size')} placeholder="185/65 R15" /></Field>
        <Field label="Marca" required className="span-6"><Input value={f.brand} onChange={set('brand')} /></Field>
        <Field label="Modelo" className="span-6"><Input value={f.model} onChange={set('model')} /></Field>
        <Field label="DOT" className="span-6"><Input value={f.dot} onChange={set('dot')} /></Field>
        <Field label="Custo de compra" className="span-6"><MoneyInput value={cost} onChange={setCost} /></Field>
      </FormGrid>
    </Modal>
  );
}

function TireDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const detail = useApi(() => api.get<TireRow & { events: TireEventRow[] }>(`/tires/${id}`), [id]);
  const [type, setType] = useState<EventType | ''>('');
  const [vehicleUnitId, setVehicle] = useState<string | null>(null);
  const [position, setPosition] = useState<TirePosition>('FL');
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const t = detail.data;
  const options: EventType[] = !t ? [] : t.status === 'INSTALLED' ? ['ROTATE', 'REPAIR', 'REMOVE'] : t.status === 'DISCARDED' ? [] : ['INSTALL', 'REPAIR', 'DISCARD'];
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/tires/${id}/events`, { type, vehicleUnitId: type === 'INSTALL' ? vehicleUnitId : undefined, position: type === 'INSTALL' || type === 'ROTATE' ? position : undefined, odometerKm: odometer ? Number(odometer) : undefined, cost: cost === '' ? undefined : cost, notes: notes || undefined });
      toast.success('Evento registrado');
      setType('');
      setNotes('');
      setCost('');
      detail.reload();
      onChanged();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Drawer open onClose={onClose} title={t ? `Pneu ${t.code}` : 'Pneu'} description={t ? `${t.brand} ${t.model ?? ''} · ${t.size}` : undefined}>
      {!t ? <LoadingBlock /> : (
        <div className="stack-lg">
          <KeyValue items={[
            { label: 'Situação', value: <Status kind="tire" value={t.status} /> },
            { label: 'Veículo', value: t.vehicle ? <Plate value={t.vehicle.plate} /> : '—' },
            { label: 'Posição', value: t.position ? TIRE_POSITION_LABEL[t.position] : '—' },
            { label: 'Km rodados', value: km(t.kmDriven) },
            { label: 'Custo total', value: money(t.totalCost) },
            { label: 'Custo por km', value: t.costPerKm === null ? '—' : `R$ ${t.costPerKm.toFixed(4).replace('.', ',')}` },
          ]} />
          {can('maintenance.manage') && options.length > 0 && (
            <Card title="Registrar evento">
              <div className="stack">
                <Field label="Evento"><Select value={type} onChange={(e) => setType(e.target.value as EventType)} placeholder="Selecione" options={options.map((o) => ({ value: o, label: EVENT_LABEL[o] }))} /></Field>
                {type === 'INSTALL' && <Field label="Veículo" required><EntityPicker value={vehicleUnitId} onChange={(v) => setVehicle(v)} load={loadVehicles()} /></Field>}
                {(type === 'INSTALL' || type === 'ROTATE') && <Field label="Posição" required><Select value={position} onChange={(e) => setPosition(e.target.value as TirePosition)} options={POSITIONS.map((p) => ({ value: p, label: TIRE_POSITION_LABEL[p] }))} /></Field>}
                {type && type !== 'DISCARD' && type !== 'REPAIR' && <Field label="Quilometragem do veículo" hint="Vazio usa o hodômetro registrado do carro."><Input inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} /></Field>}
                {type === 'REPAIR' && <Field label="Custo do reparo"><MoneyInput value={cost} onChange={setCost} /></Field>}
                {type && <Field label={type === 'DISCARD' ? 'Motivo do descarte' : 'Observação'} required={type === 'DISCARD'}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>}
                <div><Button variant="primary" loading={busy} disabled={!type || (type === 'INSTALL' && !vehicleUnitId) || (type === 'DISCARD' && !notes.trim())} onClick={submit}>Registrar</Button></div>
              </div>
            </Card>
          )}
          <div className="stack-sm">
            <span className="nc-section-title">Histórico</span>
            <Timeline items={t.events.map((e) => ({ id: e.id, title: EVENT_LABEL[e.type as EventType], meta: `${dateTime(e.at)}${e.odometerKm !== null ? ` · ${int(e.odometerKm)} km` : ''}${e.position ? ` · ${TIRE_POSITION_LABEL[e.position as TirePosition]}` : ''}${e.cost ? ` · ${money(e.cost)}` : ''}`, description: e.notes }))} />
          </div>
        </div>
      )}
    </Drawer>
  );
}
