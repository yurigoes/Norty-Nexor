/* Cauções, conciliação e fornecedores. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Handshake, Landmark, Plus } from 'lucide-react';
import type { DepositRow, Paginated, PaymentRow, SupplierRow } from '@nortycar/shared';
import { PAYMENT_METHOD_LABEL, SUPPLIER_KIND_LABEL } from '@nortycar/shared';
import { Badge, Button, Card, Page, PageHeader, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Drawer, Modal } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { dateTime, money } from '../../lib/format';
import { useSession } from '../../lib/session';
import { DepositPanel } from '../rentals/ContractDetailPage';

/* ================= Cauções ================= */

export function DepositsPage() {
  const [tab, setTab] = useState<'HELD' | 'PENDING' | 'REFUND_PENDING' | 'approval' | 'all'>('HELD');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const term = useDebounced(q);
  const list = useApi(() => api.page<DepositRow>('/deposits', {
    q: term, page, pageSize: 25, ...(tab === 'approval' ? { pendingApproval: 'true' } : tab === 'all' ? {} : { status: tab }),
  }), [term, page, tab]);
  const columns: Column<DepositRow>[] = [
    { key: 'contract', header: 'Contrato', render: (d) => <Link to={`/locacoes/contratos/${d.contract.id}`} onClick={(e) => e.stopPropagation()} className="mono">{d.contract.number}</Link> },
    { key: 'customer', header: 'Cliente', render: (d) => d.customer.name },
    { key: 'expected', header: 'Previsto', align: 'right', render: (d) => money(d.expectedAmount) },
    { key: 'received', header: 'Recebido', align: 'right', render: (d) => money(d.balance.received) },
    { key: 'available', header: 'Disponível', align: 'right', render: (d) => <strong>{money(d.balance.available)}</strong> },
    { key: 'pending', header: '', render: (d) => (d.pendingApprovals ? <Badge tone="warning">{d.pendingApprovals} a aprovar</Badge> : null) },
    { key: 'status', header: 'Situação', render: (d) => <Status kind="deposit" value={d.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Cauções" description="Valores retidos dos clientes, separados da receita. Utilizações e devoluções passam por aprovação." />
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[
        { value: 'HELD', label: 'Retidos' }, { value: 'PENDING', label: 'A receber' }, { value: 'REFUND_PENDING', label: 'A devolver' },
        { value: 'approval', label: 'Aguardando aprovação' }, { value: 'all', label: 'Todos' },
      ]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(d) => setOpenId(d.id)}
          toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Cliente ou contrato" />}
          empty={{ title: 'Nenhum caução nesta situação', icon: Landmark }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} title="Caução" wide>
        {openId && <DepositPanel depositId={openId} onChange={list.reload} />}
      </Drawer>
    </Page>
  );
}

/* ================= Conciliação ================= */

export function ReconciliationPage() {
  const toast = useToast();
  const [reconciled, setReconciled] = useState<'false' | 'true'>('false');
  const [direction, setDirection] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const term = useDebounced(q);
  const list = useApi(() => api.page<PaymentRow>('/payments', { q: term, page, pageSize: 50, reconciled, direction, from, to, status: reconciled === 'false' ? 'CONFIRMED' : undefined }), [term, page, reconciled, direction, from, to]);
  const toggle = (p: PaymentRow) => api.post(`/payments/${p.id}/${p.reconciled ? 'unreconcile' : 'reconcile'}`, p.reconciled ? {} : { bankReference: refs[p.id] || undefined })
    .then(() => { toast.success(p.reconciled ? 'Conciliação desfeita' : 'Lançamento conciliado'); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
  const columns: Column<PaymentRow>[] = [
    { key: 'paidAt', header: 'Data', render: (p) => <span className="small nowrap">{dateTime(p.paidAt)}</span> },
    { key: 'desc', header: 'Lançamento', render: (p) => <div><div>{p.receivable?.description ?? p.payable?.description}</div><div className="xsmall muted">{p.receivable?.customer?.name ?? p.payable?.supplier?.name ?? ''}</div></div> },
    { key: 'method', header: 'Forma', render: (p) => <span className="small">{PAYMENT_METHOD_LABEL[p.method]}{p.provider ? ` · ${p.provider}` : ''}</span> },
    { key: 'amount', header: 'Valor', align: 'right', render: (p) => <span className={p.direction === 'OUT' ? 'text-danger' : 'text-success'}>{p.direction === 'OUT' ? '− ' : '+ '}{money(p.amount)}</span> },
    { key: 'ref', header: 'Referência bancária', render: (p) => p.reconciled ? <span className="small">{p.bankReference ?? '—'}</span> : (
      <input className="nc-input" style={{ height: 30, minHeight: 30 }} aria-label="Referência bancária" placeholder={p.bankReference ?? 'Ex.: ID do extrato'} value={refs[p.id] ?? ''} onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })} />
    ) },
    { key: 'actions', header: '', render: (p) => <Button size="sm" variant={p.reconciled ? 'ghost' : 'primary'} onClick={() => toggle(p)}>{p.reconciled ? 'Desfazer' : 'Conciliar'}</Button> },
  ];
  return (
    <Page>
      <PageHeader title="Conciliação" description="Confira cada pagamento confirmado com o extrato bancário. Conciliado é o que bateu com o banco." />
      <Tabs value={reconciled} onChange={(v) => { setReconciled(v); setPage(1); }} tabs={[{ value: 'false', label: 'A conciliar' }, { value: 'true', label: 'Conciliados' }]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          toolbar={<div className="nc-filters">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Descrição ou referência" />
            <select className="nc-select" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }} aria-label="Sentido">
              <option value="">Entradas e saídas</option><option value="IN">Entradas</option><option value="OUT">Saídas</option>
            </select>
            <input className="nc-input" type="date" aria-label="De" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <input className="nc-input" type="date" aria-label="Até" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>}
          empty={{ title: reconciled === 'false' ? 'Tudo conciliado' : 'Nenhum lançamento conciliado no filtro', icon: Coins }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
    </Page>
  );
}

/* ================= Fornecedores ================= */

export function SuppliersPage() {
  const { canAny } = useSession();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<SupplierRow | 'new' | null>(null);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<SupplierRow>>('/suppliers', { q: term, kind, page, pageSize: 25, includeInactive: 'true' }), [term, kind, page]);
  const canWrite = canAny(['finance.payables', 'inventory.manage', 'purchases.manage', 'claims.manage', 'fleet.create']);
  const columns: Column<SupplierRow>[] = [
    { key: 'name', header: 'Fornecedor', render: (s) => <div><div className="strong">{s.name}</div><div className="xsmall muted">{s.document ?? 'Sem documento'}</div></div> },
    { key: 'kinds', header: 'Tipos', render: (s) => <div className="row" style={{ gap: 4 }}>{s.kinds.map((k) => <Badge key={k}>{SUPPLIER_KIND_LABEL[k] ?? k}</Badge>)}</div> },
    { key: 'contact', header: 'Contato', render: (s) => <span className="small">{[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'city', header: 'Cidade', render: (s) => [s.city, s.state].filter(Boolean).join('/') || '—' },
    { key: 'status', header: '', render: (s) => (s.active ? null : <Badge>Inativo</Badge>) },
  ];
  return (
    <Page>
      <PageHeader title="Fornecedores" description="Oficinas, autopeças, seguradoras e prestadores — um cadastro só para frota, estoque, ordens de serviço e contas a pagar."
        actions={canWrite && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Novo fornecedor</Button>} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={canWrite ? setEditing : undefined}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Nome, documento ou contato" />
            <select className="nc-select" style={{ width: 180 }} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} aria-label="Tipo">
              <option value="">Todos os tipos</option>
              {Object.entries(SUPPLIER_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </>}
          empty={{ title: 'Nenhum fornecedor cadastrado', icon: Handshake }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {editing && <SupplierModal supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
    </Page>
  );
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: SupplierRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: supplier?.name ?? '', document: supplier?.document ?? '', email: supplier?.email ?? '', phone: supplier?.phone ?? '',
    contactName: supplier?.contactName ?? '', city: supplier?.city ?? '', state: supplier?.state ?? '', notes: supplier?.notes ?? '',
  });
  const [kinds, setKinds] = useState<string[]>(supplier?.kinds ?? []);
  const [active, setActive] = useState(supplier?.active ?? true);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const clean = (v: string) => (v.trim() ? v.trim() : undefined);
  return (
    <Modal open onClose={onClose} size="lg" title={supplier ? supplier.name : 'Novo fornecedor'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={f.name.trim().length < 2} onClick={async () => {
        setBusy(true);
        try {
          const body = { name: f.name.trim(), document: clean(f.document), email: clean(f.email), phone: clean(f.phone), contactName: clean(f.contactName), city: clean(f.city), state: clean(f.state)?.toUpperCase(), notes: clean(f.notes), kinds };
          if (supplier) await api.patch(`/suppliers/${supplier.id}`, { ...body, active });
          else await api.post('/suppliers', body);
          toast.success('Fornecedor salvo');
          onSaved();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Nome ou razão social" required className="span-8"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="CPF ou CNPJ" className="span-4"><Input value={f.document} onChange={set('document')} /></Field>
        <Field label="Contato" className="span-4"><Input value={f.contactName} onChange={set('contactName')} /></Field>
        <Field label="Telefone" className="span-4"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="E-mail" className="span-4"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Cidade" className="span-8"><Input value={f.city} onChange={set('city')} /></Field>
        <Field label="UF" className="span-4"><Input value={f.state} maxLength={2} onChange={set('state')} /></Field>
        <div className="span-12 stack-sm">
          <span className="nc-label">Tipos de fornecimento</span>
          <div className="row">{Object.entries(SUPPLIER_KIND_LABEL).map(([k, v]) => (
            <Checkbox key={k} label={v} checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} />
          ))}</div>
        </div>
        <Field label="Observações" className="span-12"><Textarea value={f.notes} onChange={set('notes')} /></Field>
        {supplier && <div className="span-12"><Checkbox label="Fornecedor ativo" checked={active} onChange={(e) => setActive(e.target.checked)} /></div>}
      </FormGrid>
    </Modal>
  );
}
