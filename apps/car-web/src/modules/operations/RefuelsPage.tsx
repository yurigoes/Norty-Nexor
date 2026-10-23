/* Abastecimentos: registro com comprovante e sinalização automática de inconsistências. */
import { useState } from 'react';
import { AlertTriangle, Fuel, Plus } from 'lucide-react';
import { FUEL_TYPE_LABEL, PAYMENT_METHOD_LABEL, type FuelType, type Paginated, type RefuelRow } from '@nortycar/shared';
import { Alert, Badge, Button, Card, Page, PageHeader, Plate, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Dropzone, uploadFile } from '../../components/files';
import { Modal } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { dateTime, dec, fromLocalInput, km, money, toLocalInput } from '../../lib/format';
import { loadDrivers, loadSuppliers, loadVehicles } from '../../lib/pickers';
import { useSession } from '../../lib/session';

interface ConsumptionRow { vehicleUnitId: string; plate: string; records: number; liters: number; total: number; averageKmPerLiter: number | null; averagePricePerLiter: number | null; flagged: number }

export function RefuelsPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<'records' | 'consumption'>('records');
  const [flagged, setFlagged] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<RefuelRow>>('/refuels', { q: term, flagged: flagged || undefined, page, pageSize: 25 }), [term, flagged, page]);
  const consumption = useApi(() => api.get<ConsumptionRow[]>('/refuels/consumption'), [], tab === 'consumption');
  const [creating, setCreating] = useState(false);
  const columns: Column<RefuelRow>[] = [
    { key: 'at', header: 'Data', render: (r) => <span className="small nowrap">{dateTime(r.at)}</span> },
    { key: 'v', header: 'Veículo', render: (r) => <div className="stack-sm" style={{ gap: 2 }}><Plate value={r.vehicle.plate} />{r.driver && <span className="xsmall muted">{r.driver.name}</span>}</div> },
    { key: 's', header: 'Posto', render: (r) => <span className="small">{r.station ?? '—'} · {FUEL_TYPE_LABEL[r.fuel as FuelType]}</span> },
    { key: 'l', header: 'Litros', align: 'right', render: (r) => dec(r.liters) },
    { key: 't', header: 'Total', align: 'right', render: (r) => money(r.total) },
    { key: 'km', header: 'Hodômetro', align: 'right', render: (r) => km(r.odometerKm) },
    { key: 'c', header: 'Consumo', align: 'right', render: (r) => (r.consumptionKmL === null ? '—' : `${dec(r.consumptionKmL)} km/l`) },
    { key: 'f', header: 'Inconsistências', render: (r) => r.flags.length ? <div className="stack-sm" style={{ gap: 2 }}>{r.flagLabels.map((f) => <Badge key={f} tone="warning">{f}</Badge>)}</div> : <span className="muted small">Nenhuma</span> },
  ];
  return (
    <Page>
      <PageHeader title="Abastecimentos" description="Registros inconsistentes são guardados e sinalizados; quilometragem regressiva não altera o hodômetro do carro."
        actions={can('refuel.manage') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Registrar abastecimento</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'records', label: 'Registros' }, { value: 'consumption', label: 'Consumo por veículo' }]} />
      {tab === 'records' ? (
        <Card flush>
          <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
            toolbar={<><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Placa" /><Checkbox label="Só com inconsistência" checked={flagged} onChange={(e) => { setFlagged(e.target.checked); setPage(1); }} /></>}
            empty={{ title: 'Nenhum abastecimento registrado', icon: Fuel }}
            footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
        </Card>
      ) : (
        <Card flush>
          <DataTable rows={consumption.data?.map((c) => ({ ...c, id: c.vehicleUnitId }))} loading={consumption.loading} error={consumption.error}
            empty={{ title: 'Sem dados de consumo', description: 'O consumo médio aparece depois de dois abastecimentos consistentes do mesmo carro.', icon: Fuel }}
            columns={[
              { key: 'p', header: 'Veículo', render: (c) => <Plate value={c.plate} /> },
              { key: 'r', header: 'Registros', align: 'right', render: (c) => c.records },
              { key: 'l', header: 'Litros', align: 'right', render: (c) => dec(c.liters) },
              { key: 't', header: 'Gasto', align: 'right', render: (c) => money(c.total) },
              { key: 'k', header: 'Consumo médio', align: 'right', render: (c) => (c.averageKmPerLiter === null ? '—' : `${dec(c.averageKmPerLiter)} km/l`) },
              { key: 'pl', header: 'Preço médio', align: 'right', render: (c) => (c.averagePricePerLiter === null ? '—' : `R$ ${dec(c.averagePricePerLiter)}`) },
              { key: 'f', header: 'Sinalizados', align: 'right', render: (c) => c.flagged ? <span className="text-warning">{c.flagged}</span> : '0' },
            ]} />
        </Card>
      )}
      {creating && <RefuelModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); list.reload(); }} />}
    </Page>
  );
}

function RefuelModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [vehicleUnitId, setVehicle] = useState<string | null>(null);
  const [driverId, setDriver] = useState<string | null>(null);
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [at, setAt] = useState(toLocalInput(new Date()));
  const [fuel, setFuel] = useState<FuelType>('FLEX');
  const [station, setStation] = useState('');
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState<number | ''>('');
  const [odometer, setOdometer] = useState('');
  const [method, setMethod] = useState('');
  const [paidByCompany, setPaid] = useState(true);
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const l = Number(liters.replace(',', '.'));
  const p = Number(price.replace(',', '.'));
  const valid = vehicleUnitId && l > 0 && p > 0 && total !== '' && total > 0 && odometer;

  const submit = async () => {
    setBusy(true);
    try {
      const receiptFileId = receipt ? (await uploadFile(receipt, { entityType: 'RefuelRecord', category: 'comprovante' })).id : undefined;
      const r = await api.post<{ flagLabels: string[] }>('/refuels', {
        vehicleUnitId, driverId: driverId ?? undefined, at: fromLocalInput(at), fuel, station: station || undefined, liters: l, pricePerLiter: p, total,
        odometerKm: Number(odometer), paymentMethod: method || undefined, paidByCompany, supplierId: paidByCompany ? supplierId ?? undefined : undefined,
        receiptFileId, notes: notes || undefined,
      });
      if (r.flagLabels.length) setResult(r.flagLabels);
      else { toast.success('Abastecimento registrado'); onDone(); }
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  if (result) {
    return (
      <Modal open onClose={onDone} title="Abastecimento registrado com ressalvas" footer={<Button variant="primary" onClick={onDone}>Entendi</Button>}>
        <Alert tone="warning" title="Verifique o registro">
          <ul style={{ margin: 0, paddingLeft: 18 }}>{result.map((f) => <li key={f}>{f}</li>)}</ul>
        </Alert>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} size="lg" title="Registrar abastecimento"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Registrar</Button></>}>
      <FormGrid>
        <Field label="Veículo" required className="span-6"><EntityPicker value={vehicleUnitId} onChange={(v) => setVehicle(v)} load={loadVehicles()} /></Field>
        <Field label="Motorista" className="span-6"><EntityPicker value={driverId} onChange={(v) => setDriver(v)} load={loadDrivers()} /></Field>
        <Field label="Data e hora" required className="span-4"><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Combustível" required className="span-4"><Select value={fuel} onChange={(e) => setFuel(e.target.value as FuelType)} options={(Object.keys(FUEL_TYPE_LABEL) as FuelType[]).map((f) => ({ value: f, label: FUEL_TYPE_LABEL[f] }))} /></Field>
        <Field label="Posto" className="span-4"><Input value={station} onChange={(e) => setStation(e.target.value)} /></Field>
        <Field label="Litros" required className="span-4"><Input inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value.replace(/[^\d,.]/g, ''))} /></Field>
        <Field label="Preço por litro" required className="span-4"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, ''))} /></Field>
        <Field label="Valor total" required className="span-4" hint={l > 0 && p > 0 ? `Litros × preço = ${money(Math.round(l * p * 100) / 100)}` : undefined}><MoneyInput value={total} onChange={setTotal} /></Field>
        <Field label="Hodômetro" required className="span-4"><Input inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Forma de pagamento" className="span-4"><Select value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Não informado" options={(['PIX', 'CARD', 'CASH', 'TRANSFER', 'BOLETO'] as const).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} /></Field>
        <div className="span-4" style={{ alignSelf: 'end' }}><Checkbox label="Pago pela locadora" checked={paidByCompany} onChange={(e) => setPaid(e.target.checked)} /></div>
        {paidByCompany && <Field label="Posto como fornecedor (gera conta a pagar)" className="span-12"><EntityPicker value={supplierId} onChange={(v) => setSupplier(v)} load={loadSuppliers()} /></Field>}
        <div className="span-12 stack-sm">
          <span className="nc-label">Comprovante</span>
          {receipt ? <div className="row"><span className="small">{receipt.name}</span><Button size="sm" variant="ghost" onClick={() => setReceipt(null)}>Remover</Button></div> : <Dropzone multiple={false} onFiles={(f) => setReceipt(f[0] ?? null)} label="Foto ou PDF do cupom" capture="environment" />}
        </div>
        <Field label="Observações" className="span-12"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </FormGrid>
      <p className="xsmall muted" style={{ marginTop: 8 }}><AlertTriangle size={12} aria-hidden /> Litros acima da capacidade do tanque, total diferente de litros × preço e quilometragem regressiva são sinalizados.</p>
    </Modal>
  );
}
