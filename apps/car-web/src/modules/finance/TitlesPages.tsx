/* Contas a receber e a pagar: listas, baixa idempotente, estorno, aprovação. */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ReceiptText, Undo2, Wallet } from 'lucide-react';
import type { PayableRow, PaymentRow, ReceivableRow, TitlePage } from '@nortycar/shared';
import { PAYABLE_KIND_LABEL, PAYMENT_METHOD_LABEL, RECEIVABLE_KIND_LABEL } from '@nortycar/shared';
import { Alert, Badge, Button, Card, KeyValue, LoadingBlock, Page, PageHeader, Tabs } from '../../components/ui';
import { Field, FormGrid, Input, MoneyInput, Select } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Drawer, Modal, useConfirm } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage, idempotencyKey } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { loadContracts, loadCustomers, loadSuppliers, loadVehicles } from '../../lib/pickers';
import { date, dateTime, money, todayIso } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';

type Tab = 'open' | 'overdue' | 'PAID' | 'CANCELLED' | 'all';
const tabQuery = (t: Tab) => (t === 'open' ? { open: true } : t === 'overdue' ? { overdue: true } : t === 'all' ? {} : { status: t });

function Totals({ totals }: { totals?: { amount: number; paid: number } }) {
  if (!totals) return null;
  return <div className="row small muted"><span>Total: <strong className="tnum">{money(totals.amount)}</strong></span><span>Pago: <strong className="tnum">{money(totals.paid)}</strong></span><span>Saldo: <strong className="tnum">{money(totals.amount - totals.paid)}</strong></span></div>;
}

/* ================= Contas a receber ================= */

export function ReceivablesPage() {
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('overdue') ? 'overdue' : 'open');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const term = useDebounced(q);
  const list = useApi(() => api.get<TitlePage<ReceivableRow>>('/receivables', { q: term, page, pageSize: 25, branchId, kind, ...tabQuery(tab) }), [term, page, branchId, kind, tab]);
  const openId = params.get('id');
  const columns: Column<ReceivableRow>[] = [
    { key: 'due', header: 'Vencimento', render: (r) => <span className="nowrap">{date(r.dueDate)} {r.overdue && <Badge tone="danger">{r.daysOverdue} d</Badge>}</span> },
    { key: 'desc', header: 'Descrição', render: (r) => <div><div>{r.description}</div><div className="xsmall muted">{RECEIVABLE_KIND_LABEL[r.kind]}{r.contract ? ` · ${r.contract.number}` : ''}</div></div> },
    { key: 'customer', header: 'Cliente', render: (r) => r.customer?.name ?? '—' },
    { key: 'amount', header: 'Valor', align: 'right', render: (r) => money(r.amount) },
    { key: 'balance', header: 'Saldo', align: 'right', render: (r) => <div>{money(r.balance)}{r.overdue && <div className="xsmall text-danger">c/ encargos {money(r.updatedBalance)}</div>}</div> },
    { key: 'status', header: 'Situação', render: (r) => <Status kind="title" value={r.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Contas a receber" description="Locações, mensalidades, avarias, reembolsos e demais títulos. Encargos por atraso são calculados na consulta, sem alterar o título."
        actions={can('finance.receivables') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo título</Button>} />
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ value: 'open', label: 'Em aberto' }, { value: 'overdue', label: 'Vencidos' }, { value: 'PAID', label: 'Quitados' }, { value: 'CANCELLED', label: 'Cancelados' }, { value: 'all', label: 'Todos' }]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={(r) => setParams({ id: r.id })}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Descrição, cliente ou contrato" />
            <select className="nc-select" style={{ width: 200 }} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} aria-label="Tipo">
              <option value="">Todos os tipos</option>
              {Object.entries(RECEIVABLE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Totals totals={list.data?.totals} />
          </>}
          empty={{ title: 'Nenhum título aqui', icon: ReceiptText }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {openId && <ReceivableDrawer id={openId} onClose={() => setParams({})} onChanged={list.reload} />}
      {creating && <NewReceivable onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} />}
    </Page>
  );
}

function ReceivableDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const r = useApi(() => api.get<ReceivableRow & { payments: PaymentRow[] }>(`/receivables/${id}`), [id]);
  const [paying, setPaying] = useState(false);
  const refresh = () => { r.reload(); onChanged(); };
  const t = r.data;
  return (
    <Drawer open onClose={onClose} title={t?.description ?? 'Título'} description={t ? `${RECEIVABLE_KIND_LABEL[t.kind]} · vence ${date(t.dueDate)}` : ''}
      footer={t && <>
        {can('finance.receivables') && ['OPEN'].includes(t.status) && t.paidAmount === 0 && <Button onClick={async () => {
          const c = await confirm({ title: 'Cancelar título', message: 'O título deixa de ser cobrado. A decisão fica na auditoria.', requireReason: true, confirmLabel: 'Cancelar título' });
          if (c.confirmed) api.post(`/receivables/${id}/cancel`, { reason: c.reason }).then(() => { toast.success('Título cancelado'); refresh(); }).catch((e) => toast.error(errorMessage(e)));
        }}>Cancelar título</Button>}
        <span className="grow" />
        {can('finance.settle') && ['OPEN', 'PARTIAL'].includes(t.status) && <Button variant="primary" onClick={() => setPaying(true)}>Dar baixa</Button>}
      </>}>
      {!t ? <LoadingBlock /> : (
        <div className="stack-lg">
          <Status kind="title" value={t.status} />
          <KeyValue items={[
            { label: 'Cliente', value: t.customer ? <Link to={`/pessoas/clientes/${t.customer.id}`}>{t.customer.name}</Link> : '—' },
            { label: 'Contrato', value: t.contract ? <Link to={`/locacoes/contratos/${t.contract.id}`}>{t.contract.number}</Link> : '—' },
            { label: 'Valor', value: money(t.amount) },
            { label: 'Pago', value: money(t.paidAmount) },
            { label: 'Saldo', value: money(t.balance) },
            { label: 'Multa por atraso', value: money(t.lateFine), hidden: !t.overdue },
            { label: 'Juros', value: money(t.lateInterest), hidden: !t.overdue },
            { label: 'Saldo atualizado', value: <strong>{money(t.updatedBalance)}</strong>, hidden: !t.overdue },
            { label: 'Competência', value: t.competence, hidden: !t.competence },
          ]} />
          {t.cancelReason && <Alert tone="neutral">Cancelado: {t.cancelReason}</Alert>}
          <Payments payments={t.payments} onChanged={refresh} />
        </div>
      )}
      {paying && t && <PaymentModal target="receivables" id={t.id} balance={t.balance} suggested={t.overdue ? t.updatedBalance : t.balance} onClose={() => setPaying(false)} onDone={() => { setPaying(false); refresh(); }} />}
    </Drawer>
  );
}

function Payments({ payments, onChanged }: { payments: PaymentRow[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  if (!payments.length) return <p className="muted small">Nenhum pagamento registrado.</p>;
  return (
    <div className="stack-sm">
      <span className="nc-section-title">Pagamentos</span>
      <ul className="nc-list nc-card">
        {payments.map((p) => (
          <li key={p.id}>
            <div className="grow">
              <div className="strong tnum">{money(p.amount)} <span className="small muted">· {PAYMENT_METHOD_LABEL[p.method]}</span></div>
              <div className="xsmall muted">{dateTime(p.paidAt)}{p.provider ? ` · ${p.provider}` : ''}{p.bankReference ? ` · ref. ${p.bankReference}` : ''}{p.reconciled ? ' · conciliado' : ''}</div>
              {p.notes && <div className="xsmall muted">{p.notes}</div>}
            </div>
            <Status kind="payment" value={p.status} />
            {p.status === 'CONFIRMED' && p.method !== 'DEPOSIT_OFFSET' && can('finance.settle') && (
              <Button size="sm" variant="ghost" icon={Undo2} aria-label="Estornar" onClick={async () => {
                const c = await confirm({ title: 'Estornar pagamento', message: 'O pagamento fica marcado como revertido (não é apagado) e o saldo volta a abrir.', requireReason: true, confirmLabel: 'Estornar' });
                if (c.confirmed) api.post(`/payments/${p.id}/reverse`, { reason: c.reason }).then(() => { toast.success('Pagamento estornado'); onChanged(); }).catch((e) => toast.error(errorMessage(e)));
              }} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Baixa manual. A chave de idempotência nasce quando o formulário abre:
 * clicar duas vezes ou repetir após falha de rede não registra dois pagamentos.
 */
function PaymentModal({ target, id, balance, suggested, onClose, onDone }: { target: 'receivables' | 'payables'; id: string; balance: number; suggested: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [key] = useState(idempotencyKey);
  const [amount, setAmount] = useState<number | ''>(Math.min(balance, suggested));
  const [method, setMethod] = useState('PIX');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Dar baixa" description={`Saldo em aberto: ${money(balance)}. Encargos de atraso, se cobrados, entram como título à parte.`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!amount || amount > balance} onClick={async () => {
        setBusy(true);
        try {
          await api.post(`/${target}/${id}/payments`, { amount, method, paidAt: new Date(`${paidAt}T15:00:00Z`).toISOString(), idempotencyKey: key, bankReference: reference || undefined });
          toast.success('Pagamento registrado');
          onDone();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Registrar</Button></>}>
      <FormGrid>
        <Field label="Valor" required className="span-6" error={amount !== '' && amount > balance ? 'Acima do saldo em aberto.' : null}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Forma" className="span-6"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={['PIX', 'TRANSFER', 'BOLETO', 'CARD', 'CASH'].map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m as keyof typeof PAYMENT_METHOD_LABEL] }))} /></Field>
        <Field label="Data do pagamento" className="span-6"><Input type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)} /></Field>
        <Field label="Referência bancária" className="span-6"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function NewReceivable({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { session } = useSession();
  const branches = session?.context.branches ?? [];
  const costCenters = useApi(() => api.get<{ id: string; code: string; name: string; active: boolean }[]>('/cost-centers'), []);
  const [f, setF] = useState({ branchId: branches[0]?.id ?? '', kind: 'OTHER', description: '', dueDate: todayIso(), costCenterId: '' });
  const [amount, setAmount] = useState<number | ''>('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} size="lg" title="Novo título a receber"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.description || !amount || !f.branchId} onClick={async () => {
        setBusy(true);
        try {
          await api.post('/receivables', { ...f, amount, customerId: customerId ?? undefined, contractId: contractId ?? undefined, costCenterId: f.costCenterId || undefined });
          toast.success('Título criado');
          onCreated();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Criar</Button></>}>
      <FormGrid>
        <Field label="Descrição" required className="span-8"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Tipo" className="span-4"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={Object.entries(RECEIVABLE_KIND_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Valor" required className="span-4"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Vencimento" required className="span-4"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Filial" required className="span-4"><Select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })} options={branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label="Cliente" className="span-6"><EntityPicker value={customerId} onChange={setCustomerId} load={loadCustomers()} /></Field>
        <Field label="Contrato" className="span-6"><EntityPicker value={contractId} onChange={setContractId} load={loadContracts()} /></Field>
        <Field label="Centro de custo" className="span-6"><Select value={f.costCenterId} onChange={(e) => setF({ ...f, costCenterId: e.target.value })} placeholder="Nenhum" options={(costCenters.data ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} /></Field>
      </FormGrid>
    </Modal>
  );
}

/* ================= Contas a pagar ================= */

export function PayablesPage() {
  const toast = useToast();
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [tab, setTab] = useState<Tab | 'approval'>('open');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const term = useDebounced(q);
  const list = useApi(() => api.get<TitlePage<PayableRow>>('/payables', { q: term, page, pageSize: 25, branchId, ...(tab === 'approval' ? { approval: 'PENDING_APPROVAL', open: true } : tabQuery(tab)) }), [term, page, branchId, tab]);
  const approve = (p: PayableRow) => api.post(`/payables/${p.id}/approve`).then(() => { toast.success('Despesa aprovada'); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
  const columns: Column<PayableRow>[] = [
    { key: 'due', header: 'Vencimento', render: (p) => date(p.dueDate) },
    { key: 'desc', header: 'Descrição', render: (p) => <div><div>{p.description}</div><div className="xsmall muted">{PAYABLE_KIND_LABEL[p.kind]}{p.vehicle ? ` · ${p.vehicle.plate}` : ''}{p.documentNumber ? ` · doc. ${p.documentNumber}` : ''}</div></div> },
    { key: 'supplier', header: 'Fornecedor', render: (p) => p.supplier?.name ?? '—' },
    { key: 'amount', header: 'Valor', align: 'right', render: (p) => money(p.amount) },
    { key: 'approval', header: 'Aprovação', render: (p) => <Status kind="approval" value={p.approval} /> },
    { key: 'status', header: 'Situação', render: (p) => <Status kind="title" value={p.status} /> },
    { key: 'actions', header: '', render: (p) => p.approval === 'PENDING_APPROVAL' && can('finance.approve') && p.status !== 'CANCELLED'
      ? <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void approve(p); }}>Aprovar</Button> : null },
  ];
  return (
    <Page>
      <PageHeader title="Contas a pagar" description="Despesas de manutenção, peças, seguro, impostos e demais. Só despesa aprovada, dentro da alçada de quem aprova, pode ser paga."
        actions={can('finance.payables') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Nova despesa</Button>} />
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ value: 'approval', label: 'Aguardando aprovação' }, { value: 'open', label: 'Em aberto' }, { value: 'overdue', label: 'Vencidas' }, { value: 'PAID', label: 'Pagas' }, { value: 'all', label: 'Todas' }]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(p) => setOpenId(p.id)}
          toolbar={<><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Descrição, fornecedor ou documento" /><Totals totals={list.data?.totals} /></>}
          empty={{ title: 'Nenhuma despesa aqui', icon: Wallet }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {openId && <PayableDrawer id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
      {creating && <NewPayable onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} />}
    </Page>
  );
}

function PayableDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const p = useApi(() => api.get<PayableRow & { payments: PaymentRow[] }>(`/payables/${id}`), [id]);
  const [paying, setPaying] = useState(false);
  const refresh = () => { p.reload(); onChanged(); };
  const t = p.data;
  const act = async (path: 'approve' | 'reject' | 'cancel') => {
    const c = await confirm({ title: path === 'approve' ? 'Aprovar despesa' : path === 'reject' ? 'Recusar despesa' : 'Cancelar despesa', message: path === 'approve' ? 'A aprovação respeita sua alçada.' : 'A decisão fica registrada.', requireReason: path !== 'approve', confirmLabel: 'Confirmar', tone: path === 'approve' ? 'primary' : 'danger' });
    if (!c.confirmed) return;
    api.post(`/payables/${id}/${path}`, path === 'approve' ? {} : { reason: c.reason }).then(() => { toast.success('Despesa atualizada'); refresh(); }).catch((e) => toast.error(errorMessage(e)));
  };
  return (
    <Drawer open onClose={onClose} title={t?.description ?? 'Despesa'} description={t ? `${PAYABLE_KIND_LABEL[t.kind]} · vence ${date(t.dueDate)}` : ''}
      footer={t && <>
        {can('finance.payables') && t.status === 'OPEN' && t.paidAmount === 0 && <Button onClick={() => act('cancel')}>Cancelar</Button>}
        <span className="grow" />
        {t.approval === 'PENDING_APPROVAL' && can('finance.approve') && t.status !== 'CANCELLED' && <><Button onClick={() => act('reject')}>Recusar</Button><Button variant="primary" onClick={() => act('approve')}>Aprovar</Button></>}
        {t.approval === 'APPROVED' && can('finance.settle') && ['OPEN', 'PARTIAL'].includes(t.status) && <Button variant="primary" onClick={() => setPaying(true)}>Registrar pagamento</Button>}
      </>}>
      {!t ? <LoadingBlock /> : (
        <div className="stack-lg">
          <div className="row"><Status kind="approval" value={t.approval} /><Status kind="title" value={t.status} /></div>
          <KeyValue items={[
            { label: 'Fornecedor', value: t.supplier?.name ?? '—' },
            { label: 'Veículo', value: t.vehicle ? <Link to={`/frota/veiculos/${t.vehicle.id}`}>{t.vehicle.plate}</Link> : '—' },
            { label: 'Valor', value: money(t.amount) },
            { label: 'Pago', value: money(t.paidAmount) },
            { label: 'Saldo', value: money(t.balance) },
            { label: 'Documento', value: t.documentNumber ?? '—' },
          ]} />
          <Payments payments={t.payments} onChanged={refresh} />
        </div>
      )}
      {paying && t && <PaymentModal target="payables" id={t.id} balance={t.balance} suggested={t.balance} onClose={() => setPaying(false)} onDone={() => { setPaying(false); refresh(); }} />}
    </Drawer>
  );
}

function NewPayable({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { session } = useSession();
  const branches = session?.context.branches ?? [];
  const costCenters = useApi(() => api.get<{ id: string; code: string; name: string; active: boolean }[]>('/cost-centers'), []);
  const [f, setF] = useState({ branchId: branches[0]?.id ?? '', kind: 'MAINTENANCE', description: '', dueDate: todayIso(), costCenterId: '', documentNumber: '' });
  const [amount, setAmount] = useState<number | ''>('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [vehicleUnitId, setVehicleUnitId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} size="lg" title="Nova despesa" description="A despesa nasce aguardando aprovação."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.description || !amount || !f.branchId} onClick={async () => {
        setBusy(true);
        try {
          await api.post('/payables', { ...f, amount, supplierId: supplierId ?? undefined, vehicleUnitId: vehicleUnitId ?? undefined, costCenterId: f.costCenterId || undefined, documentNumber: f.documentNumber || undefined });
          toast.success('Despesa lançada', 'Aguardando aprovação.');
          onCreated();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Lançar</Button></>}>
      <FormGrid>
        <Field label="Descrição" required className="span-8"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Tipo" className="span-4"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={Object.entries(PAYABLE_KIND_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Valor" required className="span-4"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Vencimento" required className="span-4"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Filial" required className="span-4"><Select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })} options={branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label="Fornecedor" className="span-6"><EntityPicker value={supplierId} onChange={setSupplierId} load={loadSuppliers()} /></Field>
        <Field label="Veículo" className="span-6" hint="Vincular à placa entra na rentabilidade do carro."><EntityPicker value={vehicleUnitId} onChange={setVehicleUnitId} load={loadVehicles()} /></Field>
        <Field label="Centro de custo" className="span-6"><Select value={f.costCenterId} onChange={(e) => setF({ ...f, costCenterId: e.target.value })} placeholder="Nenhum" options={(costCenters.data ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} /></Field>
        <Field label="Número do documento" className="span-6"><Input value={f.documentNumber} onChange={(e) => setF({ ...f, documentNumber: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}
