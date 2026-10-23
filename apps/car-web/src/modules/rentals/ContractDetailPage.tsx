import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarPlus, CheckCircle2, ClipboardCheck, FilePen, FileSignature, KeyRound, Printer, Repeat, RefreshCw, Send, Undo2, UserRound,
  XCircle,
} from 'lucide-react';
import type { ContractDetail, ContractSettlement } from '@nortycar/shared';
import { DEPOSIT_ENTRY_TYPE_LABEL, PAYMENT_METHOD_LABEL, RECEIVABLE_KIND_LABEL, SIGNATURE_STATUS_LABEL } from '@nortycar/shared';
import { Alert, Badge, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Plate, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { Modal, useConfirm } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Attachments } from '../../components/files';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage, idempotencyKey } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { loadDrivers, loadVehicles } from '../../lib/pickers';
import { date, dateTime, fromLocalInput, km, money } from '../../lib/format';
import { useSession } from '../../lib/session';
import { INSPECTION_TYPE_LABEL } from '@nortycar/shared';
import { KindBadge, inspectionLink, modelName } from './common';

type Tab = 'summary' | 'vehicles' | 'drivers' | 'versions' | 'billing' | 'deposit' | 'inspections' | 'documents';
type ActionKind = 'activate' | 'swapDriver' | 'swapVehicle' | 'extend' | 'amend' | 'close' | 'terminate' | 'renew' | 'sign' | null;

export function ContractDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const detail = useApi(() => api.get<ContractDetail>(`/contracts/${id}`), [id]);
  const [tab, setTab] = useState<Tab>('summary');
  const [action, setAction] = useState<ActionKind>(null);
  const c = detail.data;

  if (detail.loading && !c) return <LoadingBlock />;
  if (detail.error || !c) return <ErrorState message={detail.error ?? 'Contrato não encontrado.'} onRetry={detail.reload} />;

  const currentVehicle = c.vehicles.find((v) => !v.endAt) ?? null;
  const currentDriver = c.drivers.find((d) => !d.endAt && d.primary) ?? null;
  const done = () => { setAction(null); detail.reload(); };

  const simple = async (path: string, title: string, message: string, withReason = false, tone: 'danger' | 'primary' = 'primary') => {
    const r = await confirm({ title, message, requireReason: withReason, confirmLabel: title, tone });
    if (!r.confirmed) return;
    api.post(`/contracts/${id}/${path}`, withReason ? { reason: r.reason } : {}).then(() => { toast.success('Contrato atualizado'); detail.reload(); }).catch((e) => toast.error(errorMessage(e)));
  };

  const print = async () => {
    try {
      const html = await api.get<string>(`/contracts/${id}/document`);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const w = window.open(url, '_blank');
      if (w) setTimeout(() => w.print(), 600);
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const editable = !['CLOSED', 'TERMINATED', 'CANCELLED'].includes(c.status);
  return (
    <Page>
      <PageHeader
        breadcrumb={<Link to="/locacoes/contratos"><ArrowLeft size={12} /> Contratos</Link>}
        title={<span className="row">Contrato {c.number} <Status kind="contract" value={c.status} /></span>}
        description={<span className="row"><KindBadge kind={c.kind} /> {c.customer.name} · {date(c.startAt)} → {date(c.endAt)} · versão {c.currentVersion}</span>}
        actions={<>
          <Button icon={Printer} onClick={print}>Imprimir</Button>
          {c.status === 'DRAFT' && can('contracts.edit') && <Button icon={Send} onClick={() => simple('submit', 'Enviar para aprovação', 'A proposta segue para quem tem permissão de aprovar.')}>Enviar para aprovação</Button>}
          {['DRAFT', 'PENDING_APPROVAL'].includes(c.status) && can('contracts.approve') && <Button variant="primary" icon={CheckCircle2} onClick={() => simple('approve', 'Aprovar contrato', 'A aprovação respeita sua alçada.')}>Aprovar</Button>}
          {c.status === 'APPROVED' && can('contracts.edit') && <Button variant="primary" icon={KeyRound} onClick={() => setAction('activate')}>Entregar veículo</Button>}
          {c.status === 'ACTIVE' && can('contracts.close') && <Button variant="primary" icon={Undo2} onClick={() => setAction('close')}>Registrar devolução</Button>}
        </>}
      />
      {c.status === 'APPROVED' && <Pendencies c={c} />}
      {editable && can('contracts.edit') && (
        <div className="row">
          <Button size="sm" icon={UserRound} onClick={() => setAction('swapDriver')}>Trocar motorista</Button>
          <Button size="sm" icon={Repeat} onClick={() => setAction('swapVehicle')}>Trocar veículo</Button>
          {['APPROVED', 'ACTIVE'].includes(c.status) && <Button size="sm" icon={CalendarPlus} onClick={() => setAction('extend')}>Prorrogar</Button>}
          <Button size="sm" icon={FilePen} onClick={() => setAction('amend')}>Aditivo</Button>
          {c.kind === 'LONG_TERM' && c.status === 'ACTIVE' && can('contracts.create') && <Button size="sm" icon={RefreshCw} onClick={() => setAction('renew')}>Renovar</Button>}
          {c.signatureStatus === 'PENDING' && <Button size="sm" icon={FileSignature} onClick={() => setAction('sign')}>Assinatura</Button>}
          {c.status === 'ACTIVE' && can('contracts.close') && <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setAction('terminate')}>Rescindir</Button>}
          {['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(c.status) && <Button size="sm" variant="ghost" icon={XCircle} onClick={() => simple('cancel', 'Cancelar contrato', 'A agenda do veículo é liberada.', true, 'danger')}>Cancelar</Button>}
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'summary', label: 'Resumo' }, { value: 'vehicles', label: 'Veículos', count: c.vehicles.length },
        { value: 'drivers', label: 'Motoristas', count: c.drivers.length }, { value: 'versions', label: 'Versões', count: c.versions.length },
        { value: 'billing', label: 'Cobranças', count: c.receivables.length }, { value: 'deposit', label: 'Caução', hidden: !c.deposit },
        { value: 'inspections', label: 'Vistorias' }, { value: 'documents', label: 'Documentos' },
      ]} />
      {tab === 'summary' && <Summary c={c} currentVehicle={currentVehicle} currentDriver={currentDriver} />}
      {tab === 'vehicles' && (
        <Card flush>
          <table className="nc-table"><thead><tr><th>Veículo</th><th>Início</th><th>Fim</th><th className="num">Km inicial</th><th className="num">Km final</th><th>Motivo</th></tr></thead>
            <tbody>{c.vehicles.map((v) => (
              <tr key={v.id}><td><div className="row" style={{ gap: 6 }}><Plate value={v.vehicle.plate} /><span className="small">{modelName(v.vehicle.model)}</span></div></td>
                <td className="small">{dateTime(v.startAt)}</td><td className="small">{v.endAt ? dateTime(v.endAt) : <Badge tone="success">Em uso</Badge>}</td>
                <td className="num">{km(v.startKm)}</td><td className="num">{km(v.endKm)}</td><td className="small muted">{v.reason}</td></tr>
            ))}</tbody></table>
        </Card>
      )}
      {tab === 'drivers' && (
        <Card flush>
          <table className="nc-table"><thead><tr><th>Motorista</th><th>CNH</th><th>Início</th><th>Fim</th><th>Motivo</th></tr></thead>
            <tbody>{c.drivers.map((d) => (
              <tr key={d.id}><td className="strong">{d.driver.name}{d.primary && <> <Badge tone="brand">Principal</Badge></>}</td>
                <td className="small">{d.driver.cnhCategory} · vence {date(d.driver.cnhExpiresAt)}</td>
                <td className="small">{dateTime(d.startAt)}</td><td className="small">{d.endAt ? dateTime(d.endAt) : <Badge tone="success">Vigente</Badge>}</td>
                <td className="small muted">{d.reason}</td></tr>
            ))}</tbody></table>
        </Card>
      )}
      {tab === 'versions' && <Versions c={c} />}
      {tab === 'billing' && <Billing c={c} />}
      {tab === 'deposit' && c.deposit && <DepositPanel depositId={c.deposit.id} receivables={c.receivables} onChange={detail.reload} />}
      {tab === 'inspections' && <Inspections c={c} currentVehicleId={currentVehicle?.vehicleUnitId ?? null} />}
      {tab === 'documents' && (
        <Card><Attachments entityType="RentalContract" entityId={c.id} canWrite={can('contracts.edit')} categories={[
          { value: 'contrato_assinado', label: 'Contrato assinado' }, { value: 'aditivo', label: 'Aditivo assinado' },
          { value: 'documento_cliente', label: 'Documento do cliente' }, { value: 'outro', label: 'Outro' },
        ]} /></Card>
      )}

      {action === 'activate' && <ActivateModal c={c} onClose={() => setAction(null)} onDone={done} />}
      {action === 'swapDriver' && <SwapDriverModal c={c} onClose={() => setAction(null)} onDone={done} />}
      {action === 'swapVehicle' && <SwapVehicleModal c={c} currentVehicleId={currentVehicle?.vehicleUnitId ?? ''} onClose={() => setAction(null)} onDone={done} />}
      {action === 'extend' && <ExtendModal c={c} onClose={() => setAction(null)} onDone={done} />}
      {action === 'amend' && <AmendModal c={c} onClose={() => setAction(null)} onDone={done} />}
      {(action === 'close' || action === 'terminate') && <CloseModal c={c} terminate={action === 'terminate'} currentVehicleId={currentVehicle?.vehicleUnitId ?? ''} onClose={() => setAction(null)} onDone={done} />}
      {action === 'renew' && <RenewModal c={c} onClose={() => setAction(null)} onDone={(newId) => { setAction(null); navigate(`/locacoes/contratos/${newId}`); }} />}
      {action === 'sign' && <SignModal c={c} onClose={() => setAction(null)} onDone={done} />}
    </Page>
  );
}

function Pendencies({ c }: { c: ContractDetail }) {
  const p = c.pendencies;
  const items = [
    { ok: Boolean(p.deliveryInspectionId), label: 'Vistoria de entrega concluída', link: p.vehicleUnitId ? inspectionLink('DELIVERY', c.id, p.vehicleUnitId) : null },
    { ok: p.depositOk, label: `Caução recebido (${money(p.depositReceived)} de ${money(p.depositRequired)})`, link: null },
    { ok: p.cnhOk, label: `CNH válida até o fim (${p.cnhValidUntil ? date(p.cnhValidUntil) : 'sem CNH'})`, link: null },
  ];
  const pending = items.filter((i) => !i.ok);
  if (!pending.length) return <Alert tone="success" title="Pronto para entrega">Vistoria, caução e CNH conferidos.</Alert>;
  return (
    <Alert tone="warning" title="Antes de entregar o veículo">
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {pending.map((i) => <li key={i.label}>{i.label}{i.link && <> — <Link to={i.link}>fazer vistoria</Link></>}</li>)}
      </ul>
    </Alert>
  );
}

function Summary({ c, currentVehicle, currentDriver }: { c: ContractDetail; currentVehicle: ContractDetail['vehicles'][number] | null; currentDriver: ContractDetail['drivers'][number] | null }) {
  const s = c.finalSettlement as ContractSettlement | null;
  return (
    <div className="stack">
      <div className="grid-2">
        <Card title="Partes e veículo">
          <KeyValue items={[
            { label: 'Locatário', value: <Link to={`/pessoas/clientes/${c.customer.id}`}>{c.customer.name}</Link> },
            { label: 'Contato', value: [c.customer.email, c.customer.phone].filter(Boolean).join(' · ') || '—' },
            { label: 'Motorista principal', value: currentDriver?.driver.name ?? '—' },
            { label: 'Veículo atual', value: currentVehicle ? <Link to={`/frota/veiculos/${currentVehicle.vehicleUnitId}`} className="row" style={{ gap: 6 }}><Plate value={currentVehicle.vehicle.plate} />{modelName(currentVehicle.vehicle.model)}</Link> : '—' },
            { label: 'Reserva de origem', value: c.reservation?.code ?? '—', hidden: !c.reservation },
            { label: 'Assinatura', value: SIGNATURE_STATUS_LABEL[c.signatureStatus] },
          ]} />
        </Card>
        <Card title="Condições">
          <KeyValue items={[
            { label: 'Valor total', value: money(c.totalAmount), hidden: c.kind !== 'PERIOD' },
            { label: 'Mensalidade', value: money(c.monthlyAmount), hidden: c.kind !== 'LONG_TERM' },
            { label: 'Prazo', value: `${c.termMonths} meses · vence dia ${c.billingDay}`, hidden: c.kind !== 'LONG_TERM' },
            { label: 'Reajuste', value: c.adjustmentIndex ?? '—', hidden: c.kind !== 'LONG_TERM' },
            { label: 'Quilometragem', value: c.kmAllowance ? `${c.kmAllowance.toLocaleString('pt-BR')} km ${c.kmAllowancePeriod === 'MONTH' ? 'por mês' : 'no período'}` : 'Livre' },
            { label: 'Km excedente', value: c.extraKmRate ? `${money(c.extraKmRate)}/km` : '—' },
            { label: 'Caução', value: money(c.depositRequired) },
            { label: 'Multa / juros', value: `${c.lateFeePercent}% / ${c.monthlyInterestPercent}% a.m.` },
            { label: 'Entregue em', value: dateTime(c.actualStartAt), hidden: !c.actualStartAt },
            { label: 'Devolvido em', value: dateTime(c.actualEndAt), hidden: !c.actualEndAt },
          ]} />
          {c.includedServices.length > 0 && <div className="row" style={{ marginTop: 12, gap: 6 }}>{c.includedServices.map((s) => <Badge key={s}>{s}</Badge>)}</div>}
          {c.extras.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>Extras: {c.extras.map((e) => `${e.name} (${money(e.price)}${e.pricing === 'PER_DAY' ? '/dia' : ''} × ${e.quantity})`).join(', ')}</div>}
        </Card>
      </div>
      {s && (
        <Card title="Prestação de contas final">
          <div className="stack">
            {s.warnings?.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
            <KeyValue items={[
              { label: 'Devolução', value: dateTime(s.returnAt) },
              { label: 'Km rodados', value: km(s.drivenKm) },
              { label: 'Km incluídos', value: s.includedKm === null ? 'Livre' : km(s.includedKm) },
              { label: 'Km excedente', value: `${s.extraKm} km · ${money(s.extraKmAmount)}` },
              { label: 'Diárias de atraso', value: `${s.lateDays} · ${money(s.lateAmount)}` },
              { label: 'Combustível', value: money(s.fuelCharge) },
              { label: 'Avarias', value: s.damages.length ? s.damages.map((d) => `${d.description} (${money(d.amount)})`).join('; ') : 'Nenhuma' },
              { label: 'Total cobrado', value: <strong>{money(s.total)}</strong> },
            ]} />
          </div>
        </Card>
      )}
      {c.terms && <Card title="Cláusulas específicas"><p style={{ whiteSpace: 'pre-wrap' }}>{c.terms}</p></Card>}
    </div>
  );
}

function Versions({ c }: { c: ContractDetail }) {
  const [a, setA] = useState<number>(Math.max(1, c.currentVersion - 1));
  const [b, setB] = useState<number>(c.currentVersion);
  const diff = useApi(async () => {
    const [va, vb] = await Promise.all([
      api.get<{ snapshot: Record<string, unknown> }>(`/contracts/${c.id}/versions/${a}`),
      api.get<{ snapshot: Record<string, unknown> }>(`/contracts/${c.id}/versions/${b}`),
    ]);
    const ignore = new Set(['updatedAt', 'currentVersion']);
    const keys = [...new Set([...Object.keys(va.snapshot), ...Object.keys(vb.snapshot)])].filter((k) => !ignore.has(k));
    return keys.filter((k) => JSON.stringify(va.snapshot[k]) !== JSON.stringify(vb.snapshot[k])).map((k) => ({ key: k, before: va.snapshot[k], after: vb.snapshot[k] }));
  }, [a, b, c.id]);
  const options = c.versions.map((v) => ({ value: String(v.version), label: `Versão ${v.version}` }));
  return (
    <div className="grid-2">
      <Card title="Histórico de versões" flush>
        <ul className="nc-list">
          {c.versions.map((v) => (
            <li key={v.id}><Badge tone={v.version === c.currentVersion ? 'brand' : 'neutral'}>v{v.version}</Badge><div className="grow"><div>{v.reason}</div><div className="xsmall muted">{dateTime(v.createdAt)}</div></div></li>
          ))}
        </ul>
      </Card>
      <Card title="Comparar versões" actions={<div className="row">
        <Select aria-label="Versão base" value={String(a)} onChange={(e) => setA(Number(e.target.value))} options={options} />
        <Select aria-label="Versão comparada" value={String(b)} onChange={(e) => setB(Number(e.target.value))} options={options} />
      </div>}>
        {diff.loading ? <LoadingBlock /> : diff.error ? <Alert tone="danger">{diff.error}</Alert> : !diff.data?.length ? <p className="muted">Sem diferenças entre as versões escolhidas.</p> : (
          <div className="stack-sm">
            {diff.data.map((d) => (
              <div key={d.key} className="nc-card" style={{ padding: 10 }}>
                <div className="strong mono small">{d.key}</div>
                <div className="grid-2 small">
                  <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--danger)' }}>{fmtValue(d.before)}</pre>
                  <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--success)' }}>{fmtValue(d.after)}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const fmtValue = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v, null, 1).slice(0, 1200) : String(v));

function Billing({ c }: { c: ContractDetail }) {
  if (!c.receivables.length) return <Alert tone="neutral">Os títulos nascem na entrega do veículo (locação) e mensalmente nos contratos de longo prazo.</Alert>;
  return (
    <Card flush>
      <table className="nc-table"><thead><tr><th>Descrição</th><th>Tipo</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Pago</th><th>Situação</th></tr></thead>
        <tbody>{c.receivables.map((r) => (
          <tr key={r.id}><td><Link to={`/financeiro/receber?id=${r.id}`}>{r.description}</Link></td><td className="small">{RECEIVABLE_KIND_LABEL[r.kind as keyof typeof RECEIVABLE_KIND_LABEL] ?? r.kind}</td>
            <td className="small">{date(r.dueDate)}</td><td className="num">{money(r.amount)}</td><td className="num">{money(r.paidAmount)}</td><td><Status kind="title" value={r.status} /></td></tr>
        ))}</tbody></table>
    </Card>
  );
}

function Inspections({ c, currentVehicleId }: { c: ContractDetail; currentVehicleId: string | null }) {
  const list = useApi(() => api.get<{ id: string; number: string; type: string; status: string; odometerKm: number | null; completedAt: string | null; startedAt: string; vehicle: { plate: string } }[]>(`/contracts/${c.id}/inspections`), [c.id]);
  return (
    <Card title="Vistorias vinculadas" actions={currentVehicleId && <div className="row">
      <Link className="nc-btn nc-btn--secondary nc-btn--sm" to={inspectionLink('DELIVERY', c.id, currentVehicleId)}><ClipboardCheck size={14} /> Entrega</Link>
      <Link className="nc-btn nc-btn--secondary nc-btn--sm" to={inspectionLink('RETURN', c.id, currentVehicleId)}><ClipboardCheck size={14} /> Devolução</Link>
      <Link className="nc-btn nc-btn--secondary nc-btn--sm" to={inspectionLink('DRIVER_CHANGE', c.id, currentVehicleId)}><ClipboardCheck size={14} /> Troca de motorista</Link>
    </div>} flush>
      {list.loading ? <LoadingBlock /> : !list.data?.length ? <div style={{ padding: 20 }} className="muted">Nenhuma vistoria vinculada a este contrato.</div> : (
        <table className="nc-table"><thead><tr><th>Número</th><th>Tipo</th><th>Veículo</th><th className="num">Km</th><th>Concluída</th><th>Situação</th></tr></thead>
          <tbody>{list.data.map((i) => (
            <tr key={i.id}><td><Link to={`/operacao/vistorias/${i.id}`} className="mono">{i.number}</Link></td><td>{INSPECTION_TYPE_LABEL[i.type as keyof typeof INSPECTION_TYPE_LABEL]}</td>
              <td><Plate value={i.vehicle.plate} /></td><td className="num">{km(i.odometerKm)}</td><td className="small">{dateTime(i.completedAt)}</td><td><Status kind="inspection" value={i.status} /></td></tr>
          ))}</tbody></table>
      )}
    </Card>
  );
}

/* ---------------- Caução ---------------- */

interface DepositView {
  id: string; status: string; expectedAmount: number;
  balance: { received: number; used: number; refunded: number; available: number; pendingDeductions: number };
  entries: { id: string; type: keyof typeof DEPOSIT_ENTRY_TYPE_LABEL; amount: number; method: string | null; at: string; reason: string | null; status: string; receivableId: string | null }[];
}

export function DepositPanel({ depositId, receivables, onChange }: { depositId: string; receivables?: ContractDetail['receivables']; onChange?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const d = useApi(() => api.get<DepositView>(`/deposits/${depositId}`), [depositId]);
  const [form, setForm] = useState<'receipt' | 'deduction' | 'refund' | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState('PIX');
  const [reason, setReason] = useState('');
  const [receivableId, setReceivableId] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = () => { d.reload(); onChange?.(); };
  if (!d.data) return d.error ? <ErrorState message={d.error} onRetry={d.reload} /> : <LoadingBlock />;
  const dep = d.data;
  const open = (f: typeof form) => { setForm(f); setAmount(f === 'receipt' ? Math.max(0, dep.expectedAmount - dep.balance.received) || '' : ''); setReason(''); setReceivableId(''); };
  const submit = async () => {
    setBusy(true);
    try {
      const path = form === 'receipt' ? 'receipts' : form === 'deduction' ? 'deductions' : 'refunds';
      await api.post(`/deposits/${depositId}/${path}`, {
        amount, idempotencyKey: idempotencyKey(), ...(form !== 'deduction' ? { method } : {}), ...(reason ? { reason } : {}),
        ...(form === 'deduction' && receivableId ? { receivableId } : {}),
      });
      toast.success(form === 'receipt' ? 'Recebimento registrado' : 'Pedido registrado', form === 'receipt' ? undefined : 'Aguarda aprovação de quem tem a permissão.');
      setForm(null);
      reload();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const decide = async (entryId: string, approve: boolean) => {
    const r = await confirm({ title: approve ? 'Aprovar movimento' : 'Recusar movimento', message: approve ? 'Utilizações aprovadas compensam o título indicado; devoluções saem do saldo.' : 'O pedido é recusado e fica registrado.', confirmLabel: approve ? 'Aprovar' : 'Recusar', tone: approve ? 'primary' : 'danger' });
    if (!r.confirmed) return;
    api.post(`/deposits/entries/${entryId}/${approve ? 'approve' : 'reject'}`, {}).then(() => { toast.success('Decisão registrada'); reload(); }).catch((e) => toast.error(errorMessage(e)));
  };
  return (
    <div className="stack">
      <Alert tone="neutral">Caução é valor a devolver, separado da receita. Só a parte utilizada para quitar um título vira receita, por compensação aprovada.</Alert>
      <div className="grid-4">
        <Card><div className="stack-sm"><span className="small muted">Previsto</span><strong className="tnum">{money(dep.expectedAmount)}</strong></div></Card>
        <Card><div className="stack-sm"><span className="small muted">Recebido</span><strong className="tnum">{money(dep.balance.received)}</strong></div></Card>
        <Card><div className="stack-sm"><span className="small muted">Utilizado / devolvido</span><strong className="tnum">{money(dep.balance.used)} / {money(dep.balance.refunded)}</strong></div></Card>
        <Card><div className="stack-sm"><span className="small muted">Disponível</span><strong className="tnum">{money(dep.balance.available)}</strong>{dep.balance.pendingDeductions > 0 && <span className="xsmall text-warning">{money(dep.balance.pendingDeductions)} aguardando aprovação</span>}</div></Card>
      </div>
      <Card title="Movimentos" actions={<div className="row"><Status kind="deposit" value={dep.status} />
        {can('deposits.manage') && <>
          <Button size="sm" onClick={() => open('receipt')}>Registrar recebimento</Button>
          <Button size="sm" onClick={() => open('deduction')} disabled={dep.balance.available <= 0}>Utilizar</Button>
          <Button size="sm" onClick={() => open('refund')} disabled={dep.balance.available <= 0}>Devolver</Button>
        </>}</div>} flush>
        {!dep.entries.length ? <div style={{ padding: 20 }} className="muted">Nenhum movimento.</div> : (
          <table className="nc-table"><thead><tr><th>Data</th><th>Tipo</th><th>Forma</th><th>Motivo</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
            <tbody>{dep.entries.map((e) => (
              <tr key={e.id}><td className="small">{dateTime(e.at)}</td><td>{DEPOSIT_ENTRY_TYPE_LABEL[e.type]}</td><td className="small">{e.method ? PAYMENT_METHOD_LABEL[e.method as keyof typeof PAYMENT_METHOD_LABEL] : '—'}</td>
                <td className="small muted">{e.reason}</td><td className="num">{money(e.amount)}</td><td><Status kind="approval" value={e.status} /></td>
                <td className="actions">{e.status === 'PENDING_APPROVAL' && can('deposits.approve') && <div className="row" style={{ gap: 4 }}><Button size="sm" onClick={() => decide(e.id, false)}>Recusar</Button><Button size="sm" variant="primary" onClick={() => decide(e.id, true)}>Aprovar</Button></div>}</td></tr>
            ))}</tbody></table>
        )}
      </Card>
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form === 'receipt' ? 'Recebimento de caução' : form === 'deduction' ? 'Utilização do caução' : 'Devolução do caução'}
        footer={<><Button onClick={() => setForm(null)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!amount || (form !== 'receipt' && reason.length < 3)} onClick={submit}>Registrar</Button></>}>
        <FormGrid>
          <Field label="Valor" required className="span-6"><MoneyInput value={amount} onChange={setAmount} /></Field>
          {form !== 'deduction' && <Field label="Forma" className="span-6"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={['PIX', 'TRANSFER', 'CARD', 'BOLETO', 'CASH'].map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m as keyof typeof PAYMENT_METHOD_LABEL] }))} /></Field>}
          {form === 'deduction' && receivables && (
            <Field label="Compensar o título" className="span-6" hint="Opcional. Sem título, a utilização só reduz o saldo.">
              <Select value={receivableId} onChange={(e) => setReceivableId(e.target.value)} placeholder="Nenhum" options={receivables.filter((r) => ['OPEN', 'PARTIAL'].includes(r.status)).map((r) => ({ value: r.id, label: `${r.description} — ${money(r.amount - r.paidAmount)}` }))} />
            </Field>
          )}
          <Field label="Motivo" required={form !== 'receipt'} className="span-12"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

/* ---------------- Ações ---------------- */

function ActionModal({ title, description, children, onClose, onSubmit, disabled, label = 'Confirmar' }: {
  title: string; description?: string; children: React.ReactNode; onClose: () => void; onSubmit: () => Promise<void>; disabled?: boolean; label?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={title} description={description} size="lg"
      footer={<><Button onClick={onClose}>Voltar</Button><Button variant="primary" loading={busy} disabled={disabled} onClick={async () => {
        setBusy(true);
        try { await onSubmit(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>{label}</Button></>}>
      {children}
    </Modal>
  );
}

function ActivateModal({ c, onClose, onDone }: { c: ContractDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [waive, setWaive] = useState(false);
  const [waiveReason, setWaiveReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  return (
    <ActionModal title="Entregar veículo" description="O contrato entra em vigor com o hodômetro da vistoria de entrega." label="Entregar" onClose={onClose}
      disabled={waive && waiveReason.length < 3}
      onSubmit={async () => {
        await api.post(`/contracts/${c.id}/activate`, { ...(waive ? { waiveDeposit: true, waiveReason } : {}), ...(dueDate ? { dueDate } : {}) });
        toast.success('Veículo entregue', 'Contrato em vigor.');
        onDone();
      }}>
      <div className="stack">
        <Pendencies c={c} />
        {c.kind === 'PERIOD' && <Field label="Vencimento do título da locação" hint="Padrão: hoje."><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}
        {!c.pendencies.depositOk && can('deposits.approve') && <>
          <Checkbox label="Entregar sem o caução integral (dispensa registrada na auditoria)" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
          {waive && <Field label="Motivo da dispensa" required><Textarea value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} /></Field>}
        </>}
      </div>
    </ActionModal>
  );
}

function SwapDriverModal({ c, onClose, onDone }: { c: ContractDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  return (
    <ActionModal title="Trocar motorista" description="O vínculo atual é encerrado agora e o novo começa — o histórico mostra quem dirigia em cada período." onClose={onClose}
      disabled={!driverId || reason.length < 3}
      onSubmit={async () => { await api.post(`/contracts/${c.id}/swap-driver`, { driverId, reason }); toast.success('Motorista trocado'); onDone(); }}>
      <div className="stack">
        <Field label="Novo motorista principal" required><EntityPicker value={driverId} onChange={setDriverId} load={loadDrivers()} /></Field>
        <Field label="Motivo" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="small muted">Se a empresa faz vistoria na troca de motorista, registre-a em Vistorias com o tipo "Troca de motorista".</p>
      </div>
    </ActionModal>
  );
}

function SwapVehicleModal({ c, currentVehicleId, onClose, onDone }: { c: ContractDetail; currentVehicleId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  return (
    <ActionModal title="Trocar veículo" description={c.status === 'ACTIVE' ? 'Exige a vistoria de devolução do carro atual e a de entrega do novo, ambas vinculadas ao contrato.' : 'Antes da entrega, só a reserva da agenda é trocada.'}
      onClose={onClose} disabled={!vehicleId || reason.length < 3}
      onSubmit={async () => { await api.post(`/contracts/${c.id}/swap-vehicle`, { newVehicleUnitId: vehicleId, reason }); toast.success('Veículo trocado'); onDone(); }}>
      <div className="stack">
        <Field label="Novo veículo" required><EntityPicker value={vehicleId} onChange={setVehicleId} load={loadVehicles()} /></Field>
        <Field label="Motivo" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {c.status === 'ACTIVE' && (
          <div className="row">
            <Link className="nc-btn nc-btn--secondary nc-btn--sm" to={inspectionLink('RETURN', c.id, currentVehicleId)}>Vistoria de devolução do atual</Link>
            {vehicleId && <Link className="nc-btn nc-btn--secondary nc-btn--sm" to={inspectionLink('DELIVERY', c.id, vehicleId)}>Vistoria de entrega do novo</Link>}
          </div>
        )}
      </div>
    </ActionModal>
  );
}

function ExtendModal({ c, onClose, onDone }: { c: ContractDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [newEnd, setNewEnd] = useState('');
  const [months, setMonths] = useState(1);
  const [reason, setReason] = useState('');
  return (
    <ActionModal title="Prorrogar contrato" description="A agenda do carro é estendida só se ele estiver livre depois do fim atual." onClose={onClose}
      disabled={reason.length < 3 || (c.kind === 'PERIOD' && !newEnd)}
      onSubmit={async () => {
        const r = await api.post<{ additional: number }>(`/contracts/${c.id}/extend`, c.kind === 'PERIOD' ? { newEndAt: fromLocalInput(newEnd), reason } : { additionalMonths: months, reason });
        toast.success('Contrato prorrogado', r.additional > 0 ? `Valor adicional: ${money(r.additional)}` : undefined);
        onDone();
      }}>
      <FormGrid>
        {c.kind === 'PERIOD'
          ? <Field label="Nova devolução" required className="span-6"><Input type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} /></Field>
          : <Field label="Meses adicionais" required className="span-6"><Input type="number" min={1} max={36} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></Field>}
        <Field label="Motivo" required className="span-12"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </FormGrid>
    </ActionModal>
  );
}

function AmendModal({ c, onClose, onDone }: { c: ContractDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const override = can('contracts.price_override');
  const [monthly, setMonthly] = useState<number | ''>(c.monthlyAmount ?? '');
  const [kmAllowance, setKm] = useState<number | ''>(c.kmAllowance ?? '');
  const [extraKm, setExtraKm] = useState<number | ''>(c.extraKmRate ?? '');
  const [deposit, setDeposit] = useState<number | ''>(c.depositRequired);
  const [services, setServices] = useState(c.includedServices.join('\n'));
  const [terms, setTerms] = useState(c.terms ?? '');
  const [reason, setReason] = useState('');
  return (
    <ActionModal title="Aditivo contratual" description="Cada aditivo gera uma nova versão do contrato. Valores exigem permissão de alterar valores." onClose={onClose}
      disabled={reason.length < 3}
      onSubmit={async () => {
        const body: Record<string, unknown> = { reason, includedServices: services.split('\n').map((s) => s.trim()).filter(Boolean), terms };
        if (override) {
          if (c.kind === 'LONG_TERM' && monthly !== '' && monthly !== c.monthlyAmount) body.monthlyAmount = monthly;
          if (kmAllowance !== '' && kmAllowance !== c.kmAllowance) body.kmAllowance = kmAllowance;
          if (extraKm !== '' && extraKm !== c.extraKmRate) body.extraKmRate = extraKm;
          if (deposit !== '' && deposit !== c.depositRequired) body.depositRequired = deposit;
        }
        await api.post(`/contracts/${c.id}/amend`, body);
        toast.success('Aditivo registrado');
        onDone();
      }}>
      <FormGrid>
        {c.kind === 'LONG_TERM' && <Field label="Mensalidade" className="span-6"><MoneyInput value={monthly} onChange={setMonthly} disabled={!override} /></Field>}
        <Field label="Km incluídos" className="span-6"><Input type="number" value={kmAllowance} onChange={(e) => setKm(e.target.value === '' ? '' : Number(e.target.value))} disabled={!override} /></Field>
        <Field label="Km excedente (R$/km)" className="span-6"><MoneyInput value={extraKm} onChange={setExtraKm} disabled={!override} /></Field>
        <Field label="Caução" className="span-6"><MoneyInput value={deposit} onChange={setDeposit} disabled={!override} /></Field>
        <Field label="Serviços incluídos (um por linha)" className="span-12"><Textarea value={services} onChange={(e) => setServices(e.target.value)} /></Field>
        <Field label="Cláusulas" className="span-12"><Textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
        <Field label="Motivo do aditivo" required className="span-12"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </FormGrid>
    </ActionModal>
  );
}

function CloseModal({ c, terminate, currentVehicleId, onClose, onDone }: { c: ContractDetail; terminate: boolean; currentVehicleId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [damages, setDamages] = useState<{ description: string; amount: number | '' }[]>([]);
  const [fuel, setFuel] = useState<number | ''>('');
  const [waive, setWaive] = useState(false);
  const [reason, setReason] = useState('');
  const [penalty, setPenalty] = useState<number | ''>('');
  const [notReturned, setNotReturned] = useState(false);
  const [notes, setNotes] = useState('');
  const validDamages = damages.filter((d) => d.description.trim().length >= 2 && d.amount !== '' && d.amount > 0);
  return (
    <ActionModal title={terminate ? 'Rescindir contrato' : 'Registrar devolução e encerrar'} label={terminate ? 'Rescindir' : 'Encerrar contrato'}
      description="Diárias de atraso e km excedente são calculados pelo servidor com os números das vistorias; cada cobrança vira um título."
      onClose={onClose} disabled={terminate && reason.length < 3}
      onSubmit={async () => {
        const body = {
          damages: validDamages.map((d) => ({ description: d.description, amount: d.amount })), ...(fuel ? { fuelCharge: fuel } : {}),
          ...(waive ? { waiveExtras: true } : {}), ...(notes ? { notes } : {}),
          ...(terminate ? { reason, ...(penalty ? { penaltyAmount: penalty } : {}), ...(notReturned ? { vehicleNotReturned: true } : {}) } : {}),
        };
        const r = await api.post<{ settlement: ContractSettlement }>(`/contracts/${c.id}/${terminate ? 'terminate' : 'close'}`, body);
        toast.success(terminate ? 'Contrato rescindido' : 'Contrato encerrado', `Total da prestação de contas: ${money(r.settlement.total)}`);
        onDone();
      }}>
      <div className="stack">
        {!(terminate && notReturned) && <Alert tone="info">É preciso a vistoria de devolução concluída. <Link to={inspectionLink('RETURN', c.id, currentVehicleId)}>Fazer vistoria de devolução</Link></Alert>}
        {terminate && <>
          <Field label="Motivo da rescisão" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Multa rescisória (opcional)"><MoneyInput value={penalty} onChange={setPenalty} /></Field>
          <Checkbox label="Veículo não devolvido (roubo, apreensão) — encerra sem vistoria" checked={notReturned} onChange={(e) => setNotReturned(e.target.checked)} />
        </>}
        <div className="stack-sm">
          <div className="row-between"><span className="nc-label">Avarias a cobrar</span><Button size="sm" onClick={() => setDamages([...damages, { description: '', amount: '' }])}>Adicionar avaria</Button></div>
          {damages.map((d, i) => (
            <div key={i} className="row">
              <Input aria-label="Descrição da avaria" placeholder="Descrição" value={d.description} onChange={(e) => setDamages(damages.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <div style={{ width: 180 }}><MoneyInput aria-label="Valor" value={d.amount} onChange={(v) => setDamages(damages.map((x, j) => (j === i ? { ...x, amount: v } : x)))} /></div>
            </div>
          ))}
        </div>
        <Field label="Combustível a cobrar"><MoneyInput value={fuel} onChange={setFuel} /></Field>
        {can('contracts.price_override') && <Checkbox label="Dispensar diárias de atraso e km excedente" checked={waive} onChange={(e) => setWaive(e.target.checked)} />}
        <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </ActionModal>
  );
}

function RenewModal({ c, onClose, onDone }: { c: ContractDetail; onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [months, setMonths] = useState(c.termMonths ?? 12);
  const [monthly, setMonthly] = useState<number | ''>(c.monthlyAmount ?? '');
  const [reason, setReason] = useState('');
  return (
    <ActionModal title="Renovar contrato" description="Cria uma nova proposta ligada a este contrato, começando no fim dele, com o mesmo veículo e motorista." onClose={onClose}
      disabled={reason.length < 3}
      onSubmit={async () => {
        const r = await api.post<{ id: string; number: string }>(`/contracts/${c.id}/renew`, { termMonths: months, reason, ...(monthly !== '' && monthly !== c.monthlyAmount ? { monthlyAmount: monthly } : {}) });
        toast.success(`Renovação ${r.number} criada`, 'Siga o fluxo de aprovação.');
        onDone(r.id);
      }}>
      <FormGrid>
        <Field label="Prazo (meses)" required className="span-6"><Input type="number" min={1} max={60} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></Field>
        <Field label="Nova mensalidade" className="span-6" hint="Diferente da atual exige permissão de alterar valores."><MoneyInput value={monthly} onChange={setMonthly} disabled={!can('contracts.price_override')} /></Field>
        <Field label="Motivo" required className="span-12"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </FormGrid>
    </ActionModal>
  );
}

function SignModal({ c, onClose, onDone }: { c: ContractDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const files = useApi(() => api.get<{ id: string; name: string; category: string | null }[]>('/files', { entityType: 'RentalContract', entityId: c.id }), [c.id]);
  const signed = (files.data ?? []).filter((f) => f.category === 'contrato_assinado');
  const [fileId, setFileId] = useState('');
  return (
    <ActionModal title="Assinatura do contrato" label="Registrar assinatura em papel" onClose={onClose} disabled={!fileId}
      onSubmit={async () => { await api.post(`/contracts/${c.id}/signature/physical`, { fileId }); toast.success('Assinatura registrada'); onDone(); }}>
      <div className="stack">
        <Alert tone="neutral" title="Assinatura eletrônica pendente de configuração">Nenhum provedor de assinatura eletrônica está integrado. Imprima o contrato, colete as assinaturas e anexe o documento digitalizado na aba Documentos com o tipo "Contrato assinado".</Alert>
        {files.loading ? <LoadingBlock /> : !signed.length ? <p className="muted">Nenhum contrato assinado anexado ainda.</p> : (
          <Field label="Documento assinado" required><Select value={fileId} onChange={(e) => setFileId(e.target.value)} placeholder="Selecione" options={signed.map((f) => ({ value: f.id, label: f.name }))} /></Field>
        )}
      </div>
    </ActionModal>
  );
}
