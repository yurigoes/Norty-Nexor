import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, Check, KeyRound, Plus, XCircle } from 'lucide-react';
import type { ReservationQuote, ReservationRow } from '@nortycar/shared';
import { Alert, Badge, Button, Card, KeyValue, LoadingBlock, Page, PageHeader, Plate, Steps, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Drawer, Modal, useConfirm } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { loadCustomers, loadDrivers } from '../../lib/pickers';
import { dateTime, fromLocalInput, money, toLocalInput } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';
import { loadAvailable, modelName, useCategories, type AvailableUnit } from './common';

type Tab = 'REQUESTED' | 'CONFIRMED' | 'CHECKED_OUT' | 'ALL';

export function ReservationsPage() {
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('CONFIRMED');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(params.get('id'));
  const term = useDebounced(q);
  const creating = params.get('novo') === '1';
  const list = useApi(
    () => api.page<ReservationRow>('/reservations', { q: term, page, pageSize: 25, branchId, status: tab === 'ALL' ? undefined : tab, sort: 'startAt', order: tab === 'ALL' ? 'desc' : 'asc' }),
    [term, page, branchId, tab],
  );

  const columns: Column<ReservationRow>[] = [
    { key: 'code', header: 'Reserva', render: (r) => <span className="mono strong">{r.code}</span> },
    { key: 'customer', header: 'Cliente', render: (r) => r.customer.name },
    { key: 'period', header: 'Período', render: (r) => <span className="small nowrap">{dateTime(r.startAt)} → {dateTime(r.endAt)}</span> },
    { key: 'vehicle', header: 'Veículo', render: (r) => r.vehicle ? <span className="row" style={{ gap: 6 }}><Plate value={r.vehicle.plate} /><span className="small muted">{modelName(r.vehicle.model)}</span></span> : <span className="muted small">{r.category.name} · a definir</span> },
    { key: 'total', header: 'Total', align: 'right', render: (r) => money(r.total) },
    { key: 'status', header: 'Situação', render: (r) => <Status kind="reservation" value={r.status} /> },
  ];

  return (
    <Page>
      <PageHeader title="Reservas" description="Pedidos, confirmações e retiradas. A confirmação ocupa a agenda do carro — o servidor impede duas reservas no mesmo período."
        actions={can('reservations.create') && <Button variant="primary" icon={Plus} onClick={() => setParams({ novo: '1' })}>Nova reserva</Button>} />
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[
        { value: 'REQUESTED', label: 'Solicitadas' }, { value: 'CONFIRMED', label: 'Confirmadas' },
        { value: 'CHECKED_OUT', label: 'Retiradas' }, { value: 'ALL', label: 'Todas' },
      ]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={(r) => setOpenId(r.id)}
          toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Código, cliente ou placa" />}
          empty={{ title: 'Nenhuma reserva aqui', description: 'Crie uma reserva para um cliente ou acompanhe os pedidos do site.', icon: CalendarClock }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <NewReservation onClose={() => setParams({})} onCreated={(id) => { setParams({}); list.reload(); setOpenId(id); }} prefill={params} />}
      {openId && <ReservationDrawer id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </Page>
  );
}

/* ---------------- Nova reserva (em etapas) ---------------- */

const STEPS = ['Cliente', 'Período', 'Cotação', 'Veículo'];

function NewReservation({ onClose, onCreated, prefill }: { onClose: () => void; onCreated: (id: string) => void; prefill: URLSearchParams }) {
  const toast = useToast();
  const { session, can } = useSession();
  const { branchId: filterBranch } = useBranchFilter();
  const categories = useCategories();
  const extras = useApi(() => api.get<{ id: string; name: string; pricing: string; price: number; active: boolean }[]>('/pricing/extras'), []);
  const branches = session?.context.branches ?? [];
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(filterBranch || branches[0]?.id || '');
  const [categoryId, setCategoryId] = useState(prefill.get('categoryId') ?? '');
  const [startAt, setStartAt] = useState(prefill.get('startAt') ? toLocalInput(prefill.get('startAt')) : '');
  const [endAt, setEndAt] = useState(prefill.get('endAt') ? toLocalInput(prefill.get('endAt')) : '');
  const [chosenExtras, setChosenExtras] = useState<Record<string, number>>({});
  const [additionalDrivers, setAdditionalDrivers] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<ReservationQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [units, setUnits] = useState<AvailableUnit[] | null>(null);
  const [vehicleUnitId, setVehicleUnitId] = useState('');
  const [busy, setBusy] = useState(false);
  const leadId = prefill.get('leadId');

  const extrasPayload = useMemo(() => Object.entries(chosenExtras).filter(([, q]) => q > 0).map(([extraServiceId, quantity]) => ({ extraServiceId, quantity })), [chosenExtras]);
  const period = { startAt: fromLocalInput(startAt), endAt: fromLocalInput(endAt) };

  useEffect(() => {
    if (step !== 2 || !period.startAt || !period.endAt) return;
    setQuote(null);
    setQuoteError(null);
    api.post<ReservationQuote>('/pricing/quote', { categoryId, branchId, ...period, extras: extrasPayload, additionalDrivers, discountPercent: discount || undefined })
      .then(setQuote).catch((e) => setQuoteError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, categoryId, branchId, startAt, endAt, extrasPayload, additionalDrivers, discount]);

  useEffect(() => {
    if (step !== 3 || !period.startAt || !period.endAt) return;
    setUnits(null);
    loadAvailable({ startAt: period.startAt, endAt: period.endAt, categoryId, branchId }).then(setUnits).catch((e) => { setUnits([]); toast.error(errorMessage(e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const canNext = [Boolean(customerId), Boolean(branchId && categoryId && period.startAt && period.endAt && period.endAt > period.startAt), Boolean(quote), true][step];

  const submit = async (confirm: boolean) => {
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>('/reservations', {
        customerId, driverId: driverId ?? undefined, categoryId, branchId, ...period, extras: extrasPayload,
        additionalDrivers, discountPercent: discount || undefined, notes: notes || undefined, leadId: leadId ?? undefined,
        vehicleUnitId: vehicleUnitId || undefined, confirm: confirm || undefined,
      });
      toast.success(confirm ? 'Reserva confirmada' : 'Reserva registrada', confirm ? 'O veículo está bloqueado na agenda.' : 'Confirme quando houver veículo.');
      onCreated(r.id);
    } catch (e) {
      toast.error('Não foi possível salvar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title="Nova reserva" description={<Steps steps={STEPS} current={step} />}
      footer={<>
        {step > 0 && <Button onClick={() => setStep(step - 1)}>Voltar</Button>}
        <span className="grow" />
        {step < 3 && <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continuar</Button>}
        {step === 3 && <>
          <Button loading={busy} onClick={() => submit(false)}>Salvar como solicitada</Button>
          {can('reservations.confirm') && <Button variant="primary" icon={Check} loading={busy} disabled={!vehicleUnitId} onClick={() => submit(true)}>Confirmar com o veículo</Button>}
        </>}
      </>}>
      {leadId && step === 0 && (
        <Alert tone="info" title="Pedido do site">
          {[prefill.get('name'), prefill.get('email'), prefill.get('phone')].filter(Boolean).join(' · ')}. Selecione o cliente (ou cadastre-o em Pessoas) — o pedido será marcado como convertido.
        </Alert>
      )}
      {step === 0 && (
        <FormGrid>
          <Field label="Cliente" required className="span-12"><EntityPicker value={customerId} onChange={(id) => { setCustomerId(id); setDriverId(null); }} load={loadCustomers()} placeholder="Nome, CPF ou CNPJ" /></Field>
          <Field label="Motorista principal" className="span-12" hint="Pode ser definido na retirada. A CNH precisa valer até a devolução.">
            <EntityPicker value={driverId} onChange={setDriverId} load={loadDrivers(customerId ? { customerId } : {})} placeholder="Nome ou CPF" disabled={!customerId} />
          </Field>
        </FormGrid>
      )}
      {step === 1 && (
        <FormGrid>
          <Field label="Filial de retirada" required className="span-6"><Select value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
          <Field label="Categoria" required className="span-6"><Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="Selecione" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Retirada" required className="span-6"><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
          <Field label="Devolução" required className="span-6" error={startAt && endAt && endAt <= startAt ? 'A devolução precisa ser depois da retirada.' : null}><Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></Field>
        </FormGrid>
      )}
      {step === 2 && (
        <div className="stack">
          <div className="grid-2">
            <div className="stack-sm">
              <span className="nc-label">Serviços adicionais</span>
              {(extras.data ?? []).filter((x) => x.active).map((x) => (
                <div key={x.id} className="row-between">
                  <Checkbox label={`${x.name} — ${money(x.price)}${x.pricing === 'PER_DAY' ? '/dia' : ''}`} checked={(chosenExtras[x.id] ?? 0) > 0}
                    onChange={(e) => setChosenExtras({ ...chosenExtras, [x.id]: e.target.checked ? 1 : 0 })} />
                </div>
              ))}
              {extras.data && !extras.data.length && <span className="small muted">Nenhum serviço adicional cadastrado.</span>}
            </div>
            <div className="stack">
              <Field label="Condutores adicionais"><Input type="number" min={0} max={5} value={additionalDrivers} onChange={(e) => setAdditionalDrivers(Number(e.target.value))} /></Field>
              {can('contracts.price_override') && <Field label="Desconto (%)" hint="Exige permissão de alterar valores."><Input type="number" min={0} max={100} step="0.5" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></Field>}
            </div>
          </div>
          {quoteError ? <Alert tone="danger">{quoteError}</Alert> : !quote ? <LoadingBlock /> : <QuoteView quote={quote} />}
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <p className="small muted">Unidades livres no período, já considerando reservas, contratos, manutenções, bloqueios e o tempo de preparo.</p>
          {!units ? <LoadingBlock /> : !units.length ? (
            <Alert tone="warning" title="Nenhuma unidade livre nesta categoria e filial">Salve como solicitada para confirmar depois, ou volte e altere o período.</Alert>
          ) : (
            <div className="stack-sm">
              {units.map((u) => (
                <label key={u.id} className="context-item" style={{ cursor: 'pointer' }}>
                  <input type="radio" name="vehicle" checked={vehicleUnitId === u.id} onChange={() => setVehicleUnitId(u.id)} />
                  <Plate value={u.plate} />
                  <span className="grow">{modelName(u.model)}{u.color ? ` · ${u.color}` : ''}</span>
                  {u.odometerKm !== undefined && <span className="small muted tnum">{u.odometerKm.toLocaleString('pt-BR')} km</span>}
                </label>
              ))}
            </div>
          )}
          <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Field>
          {quote && <div className="row-between"><span className="muted">Total cotado pelo servidor</span><strong className="tnum">{money(quote.total)}</strong></div>}
        </div>
      )}
    </Modal>
  );
}

export function QuoteView({ quote }: { quote: ReservationQuote }) {
  return (
    <div className="nc-card" style={{ padding: 'var(--space-4)' }}>
      <table className="nc-table">
        <thead><tr><th>Item</th><th className="num">Qtd.</th><th className="num">Unitário</th><th className="num">Total</th></tr></thead>
        <tbody>
          {quote.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td className="num">{l.quantity}</td><td className="num">{money(l.unitPrice)}</td><td className="num">{money(l.total)}</td></tr>)}
          {quote.discount > 0 && <tr><td colSpan={3}>Desconto</td><td className="num">− {money(quote.discount)}</td></tr>}
          <tr><td colSpan={3} className="strong">Total ({quote.billableDays} diária{quote.billableDays > 1 ? 's' : ''})</td><td className="num strong">{money(quote.total)}</td></tr>
        </tbody>
      </table>
      <div className="row small muted" style={{ marginTop: 8 }}>
        <span>Caução: {money(quote.depositAmount)}</span>
        <span>Quilometragem: {quote.includedKm === null ? 'livre' : `${quote.includedKm.toLocaleString('pt-BR')} km incluídos`}{quote.extraKmRate ? ` · excedente ${money(quote.extraKmRate)}/km` : ''}</span>
      </div>
    </div>
  );
}

/* ---------------- Detalhe ---------------- */

interface ReservationDetail extends ReservationRow { driver: { id: string; name: string; cnhExpiresAt: string } | null; customer: ReservationRow['customer'] & { email?: string; phone?: string; status?: string } }

function ReservationDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { can } = useSession();
  const detail = useApi(() => api.get<ReservationDetail>(`/reservations/${id}`), [id]);
  const [confirming, setConfirming] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const r = detail.data;
  const refresh = () => { detail.reload(); onChanged(); };

  const cancel = async (noShow = false) => {
    const res = await confirm({ title: noShow ? 'Registrar não comparecimento' : 'Cancelar reserva', message: 'O veículo volta a ficar livre na agenda.', requireReason: true, confirmLabel: noShow ? 'Registrar' : 'Cancelar reserva' });
    if (!res.confirmed) return;
    api.post(`/reservations/${id}/${noShow ? 'no-show' : 'cancel'}`, { reason: res.reason }).then(() => { toast.success('Reserva atualizada'); refresh(); }).catch((e) => toast.error(errorMessage(e)));
  };

  return (
    <Drawer open onClose={onClose} title={r ? `Reserva ${r.code}` : 'Reserva'} description={r ? r.customer.name : ''}
      footer={r && <>
        {['REQUESTED', 'CONFIRMED'].includes(r.status) && can('reservations.cancel') && <Button icon={XCircle} onClick={() => cancel()}>Cancelar</Button>}
        {r.status === 'CONFIRMED' && new Date(r.startAt) < new Date() && can('reservations.cancel') && <Button onClick={() => cancel(true)}>Não compareceu</Button>}
        <span className="grow" />
        {r.status === 'REQUESTED' && can('reservations.confirm') && <Button variant="primary" icon={Check} onClick={() => setConfirming(true)}>Confirmar</Button>}
        {r.status === 'CONFIRMED' && can('contracts.create') && <Button variant="primary" icon={KeyRound} onClick={() => setCheckout(true)}>Registrar retirada</Button>}
        {r.contract && <Button variant="primary" onClick={() => navigate(`/locacoes/contratos/${r.contract!.id}`)}>Abrir contrato {r.contract.number}</Button>}
      </>}>
      {!r ? <LoadingBlock /> : (
        <div className="stack-lg">
          <div className="row"><Status kind="reservation" value={r.status} />{r.source !== 'INTERNAL' && <Badge tone="info">{r.source === 'PUBLIC_SITE' ? 'Site' : 'Portal'}</Badge>}</div>
          {r.cancelReason && <Alert tone="neutral">{r.cancelReason}</Alert>}
          <KeyValue items={[
            { label: 'Cliente', value: r.customer.name },
            { label: 'Motorista', value: r.driver?.name ?? 'A definir' },
            { label: 'Categoria', value: r.category.name },
            { label: 'Veículo', value: r.vehicle ? <span className="row" style={{ gap: 6 }}><Plate value={r.vehicle.plate} />{modelName(r.vehicle.model)}</span> : 'A definir' },
            { label: 'Retirada', value: dateTime(r.startAt) },
            { label: 'Devolução', value: dateTime(r.endAt) },
            { label: 'Total', value: money(r.total) },
            { label: 'Caução', value: money(r.depositAmount) },
          ]} />
          {r.quote?.lines && <QuoteView quote={r.quote} />}
          {r.notes && <div><span className="nc-section-title">Observações</span><p>{r.notes}</p></div>}
        </div>
      )}
      {confirming && r && <ConfirmModal reservation={r} onClose={() => setConfirming(false)} onDone={() => { setConfirming(false); refresh(); }} />}
      {checkout && r && <CheckoutModal reservation={r} onClose={() => setCheckout(false)} onDone={(contractId) => { setCheckout(false); onChanged(); navigate(`/locacoes/contratos/${contractId}`); }} />}
    </Drawer>
  );
}

function ConfirmModal({ reservation, onClose, onDone }: { reservation: ReservationDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [units, setUnits] = useState<AvailableUnit[] | null>(null);
  const [vehicleUnitId, setVehicle] = useState(reservation.vehicleUnitId ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadAvailable({ startAt: reservation.startAt, endAt: reservation.endAt, categoryId: reservation.categoryId, branchId: reservation.branchId })
      .then(setUnits).catch((e) => { setUnits([]); toast.error(errorMessage(e)); });
  }, [reservation, toast]);
  return (
    <Modal open onClose={onClose} title="Confirmar reserva" description="Escolha a unidade. Se outra pessoa confirmar o mesmo carro antes, o servidor avisa."
      footer={<><Button onClick={onClose}>Voltar</Button><Button variant="primary" loading={busy} disabled={!vehicleUnitId} onClick={async () => {
        setBusy(true);
        try { await api.post(`/reservations/${reservation.id}/confirm`, { vehicleUnitId }); toast.success('Reserva confirmada'); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Confirmar</Button></>}>
      {!units ? <LoadingBlock /> : !units.length ? <Alert tone="warning">Nenhuma unidade livre desta categoria na filial para o período.</Alert> : (
        <div className="stack-sm">
          {units.map((u) => (
            <label key={u.id} className="context-item" style={{ cursor: 'pointer' }}>
              <input type="radio" name="v" checked={vehicleUnitId === u.id} onChange={() => setVehicle(u.id)} />
              <Plate value={u.plate} /><span className="grow">{modelName(u.model)}{u.color ? ` · ${u.color}` : ''}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

function CheckoutModal({ reservation, onClose, onDone }: { reservation: ReservationDetail; onClose: () => void; onDone: (contractId: string) => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [driverId, setDriverId] = useState<string | null>(reservation.driverId);
  const [override, setOverride] = useState(false);
  const [total, setTotal] = useState(String(reservation.total));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Registrar retirada" description="Gera o contrato por período a partir da reserva. A entrega do carro acontece no contrato, após a vistoria."
      footer={<><Button onClick={onClose}>Voltar</Button><Button variant="primary" loading={busy} disabled={!driverId || (override && reason.length < 3)} onClick={async () => {
        setBusy(true);
        try {
          const c = await api.post<{ id: string; number: string }>(`/reservations/${reservation.id}/checkout`, {
            driverId, ...(override ? { totalAmount: Number(total.replace(',', '.')), priceReason: reason } : {}),
          });
          toast.success(`Contrato ${c.number} gerado`, 'Faça a vistoria de entrega e registre a entrega.');
          onDone(c.id);
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Gerar contrato</Button></>}>
      <div className="stack">
        <Field label="Motorista principal" required><EntityPicker value={driverId} onChange={setDriverId} load={loadDrivers({ customerId: reservation.customerId })} initialLabel={reservation.driver?.name} /></Field>
        {can('contracts.price_override') && (
          <>
            <Checkbox label="Alterar o valor cotado" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            {override && <FormGrid>
              <Field label="Novo total (R$)" className="span-6"><Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
              <Field label="Motivo" required className="span-6"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </FormGrid>}
          </>
        )}
      </div>
    </Modal>
  );
}

