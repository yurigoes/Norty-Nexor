/* Pedidos de compra: criação, aprovação dentro da alçada e recebimento parcial ou total. */
import { useState } from 'react';
import { PackageCheck, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import type { Paginated, PurchaseOrderDetail, PurchaseOrderRow } from '@nortycar/shared';
import { Alert, Button, Card, KeyValue, LoadingBlock, Page, PageHeader, Tabs } from '../../components/ui';
import { Field, FormGrid, Input, MoneyInput, Select } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Drawer, Modal, useConfirm } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage, idempotencyKey } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, dec, money } from '../../lib/format';
import { loadProducts, loadSuppliers } from '../../lib/pickers';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';

interface Location { id: string; name: string; branchId: string; active: boolean; branch: { name: string } }

export function PurchasesPage() {
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<PurchaseOrderRow>>('/purchase-orders', { status, q: term, page, pageSize: 25, branchId }), [status, term, page, branchId]);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const columns: Column<PurchaseOrderRow>[] = [
    { key: 'n', header: 'Pedido', render: (p) => <span className="strong mono">{p.number}</span> },
    { key: 's', header: 'Fornecedor', render: (p) => p.supplier.name },
    { key: 'i', header: 'Itens', align: 'right', render: (p) => p._count?.items ?? '—' },
    { key: 'e', header: 'Previsão', render: (p) => date(p.expectedAt) },
    { key: 't', header: 'Total', align: 'right', render: (p) => money(p.total) },
    { key: 'st', header: 'Situação', render: (p) => <Status kind="purchase" value={p.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Compras" description="Pedidos a fornecedores. O recebimento dá entrada no estoque e gera a conta a pagar."
        actions={can('purchases.manage') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo pedido</Button>} />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[
        { value: '', label: 'Todos' }, { value: 'PENDING_APPROVAL', label: 'Aguardando aprovação' }, { value: 'APPROVED', label: 'Aprovados' },
        { value: 'PARTIALLY_RECEIVED', label: 'Recebidos em parte' }, { value: 'RECEIVED', label: 'Recebidos' },
      ]} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(p) => setOpen(p.id)}
          toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Número ou fornecedor" />}
          empty={{ title: 'Nenhum pedido de compra', icon: ShoppingCart }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <NewPurchaseModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); list.reload(); setOpen(id); }} />}
      {open && <PurchaseDrawer id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </Page>
  );
}

function NewPurchaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const { session } = useSession();
  const branches = session?.context.branches ?? [];
  const [branchId, setBranch] = useState(branches[0]?.id ?? '');
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [expectedAt, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ productId: string | null; label: string; quantity: string; unitCost: number | '' }[]>([{ productId: null, label: '', quantity: '1', unitCost: '' }]);
  const [busy, setBusy] = useState(false);
  const total = items.reduce((a, i) => a + (Number(i.quantity.replace(',', '.')) || 0) * (i.unitCost || 0), 0);
  const valid = branchId && supplierId && items.length && items.every((i) => i.productId && Number(i.quantity.replace(',', '.')) > 0 && i.unitCost !== '');
  return (
    <Modal open onClose={onClose} size="lg" title="Novo pedido de compra"
      footer={<><span className="grow strong">Total {money(total)}</span><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={async () => {
        setBusy(true);
        try {
          const r = await api.post<{ id: string }>('/purchase-orders', { branchId, supplierId, expectedAt: expectedAt || undefined, notes: notes || undefined, items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity.replace(',', '.')), unitCost: i.unitCost })) });
          toast.success('Pedido criado'); onCreated(r.id);
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Criar pedido</Button></>}>
      <div className="stack">
        <FormGrid>
          <Field label="Filial" required className="span-4"><Select value={branchId} onChange={(e) => setBranch(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
          <Field label="Fornecedor" required className="span-8"><EntityPicker value={supplierId} onChange={(v) => setSupplier(v)} load={loadSuppliers()} /></Field>
          <Field label="Previsão de entrega" className="span-4"><Input type="date" value={expectedAt} onChange={(e) => setExpected(e.target.value)} /></Field>
          <Field label="Observações" className="span-8"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </FormGrid>
        <span className="nc-section-title">Itens</span>
        {items.map((it, idx) => (
          <div key={idx} className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow" style={{ minWidth: 220 }}><Field label="Produto" required><EntityPicker value={it.productId} onChange={(v, o) => setItems(items.map((x, i) => (i === idx ? { ...x, productId: v, label: o?.label ?? '' } : x)))} load={loadProducts()} /></Field></div>
            <div style={{ width: 110 }}><Field label="Qtd." required><Input inputMode="decimal" value={it.quantity} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value.replace(/[^\d,.]/g, '') } : x)))} /></Field></div>
            <div style={{ width: 150 }}><Field label="Custo unit." required><MoneyInput value={it.unitCost} onChange={(v) => setItems(items.map((x, i) => (i === idx ? { ...x, unitCost: v } : x)))} /></Field></div>
            <Button variant="ghost" icon={Trash2} aria-label="Remover item" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== idx))} />
          </div>
        ))}
        <div><Button size="sm" icon={Plus} onClick={() => setItems([...items, { productId: null, label: '', quantity: '1', unitCost: '' }])}>Adicionar item</Button></div>
      </div>
    </Modal>
  );
}

function PurchaseDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const detail = useApi(() => api.get<PurchaseOrderDetail>(`/purchase-orders/${id}`), [id]);
  const [receiving, setReceiving] = useState(false);
  const p = detail.data;
  const act = async (path: string, title: string, message: string, done: string, reason = false) => {
    const r = await confirm({ title, message, tone: reason ? 'danger' : 'primary', requireReason: reason, confirmLabel: 'Confirmar' });
    if (!r.confirmed) return;
    api.post(`/purchase-orders/${id}/${path}`, reason ? { reason: r.reason } : {}).then(() => { toast.success(done); detail.reload(); onChanged(); }).catch((e) => toast.error(errorMessage(e)));
  };
  return (
    <Drawer open onClose={onClose} wide title={p ? `Pedido ${p.number}` : 'Pedido'} description={p?.supplier.name}
      footer={p && <>
        {p.status === 'DRAFT' && can('purchases.manage') && <Button onClick={() => act('submit', 'Enviar para aprovação', 'O pedido segue para quem tem alçada de compras.', 'Enviado para aprovação')}>Enviar para aprovação</Button>}
        {['DRAFT', 'PENDING_APPROVAL'].includes(p.status) && can('purchases.approve') && <Button variant="primary" onClick={() => act('approve', 'Autorizar compra', `Autorizar ${money(p.total)} com ${p.supplier.name}.`, 'Compra autorizada')}>Autorizar</Button>}
        {['APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status) && can('inventory.move') && <Button variant="primary" icon={PackageCheck} onClick={() => setReceiving(true)}>Receber mercadoria</Button>}
        {!['RECEIVED', 'CANCELLED'].includes(p.status) && can('purchases.manage') && <Button variant="danger" onClick={() => act('cancel', 'Cancelar pedido', 'Pedidos com itens recebidos não podem ser cancelados.', 'Pedido cancelado', true)}>Cancelar</Button>}
      </>}>
      {!p ? <LoadingBlock /> : (
        <div className="stack-lg">
          <KeyValue items={[
            { label: 'Situação', value: <Status kind="purchase" value={p.status} /> },
            { label: 'Total', value: money(p.total) },
            { label: 'Previsão', value: date(p.expectedAt) },
            { label: 'Autorizado em', value: date(p.approvedAt), hidden: !p.approvedAt },
          ]} />
          {p.notes && <Alert tone="neutral">{p.notes}</Alert>}
          <table className="nc-table">
            <thead><tr><th>Produto</th><th className="num">Pedido</th><th className="num">Recebido</th><th className="num">Custo</th></tr></thead>
            <tbody>{p.items.map((i) => <tr key={i.id}><td><div className="small strong">{i.product?.description}</div><div className="xsmall muted mono">{i.product?.sku}</div></td><td className="num">{dec(i.quantity)}</td><td className="num">{dec(i.receivedQty)}</td><td className="num">{money(i.unitCost)}</td></tr>)}</tbody>
          </table>
          {p.payables.length > 0 && (
            <div className="stack-sm">
              <span className="nc-section-title">Contas a pagar geradas</span>
              {p.payables.map((x) => <div key={x.id} className="row-between small"><span>{x.documentNumber ?? 'Sem documento'} · vence {date(x.dueDate)}</span><span className="strong">{money(x.amount)}</span></div>)}
            </div>
          )}
        </div>
      )}
      {receiving && p && <ReceiveModal order={p} onClose={() => setReceiving(false)} onDone={() => { setReceiving(false); detail.reload(); onChanged(); }} />}
    </Drawer>
  );
}

function ReceiveModal({ order, onClose, onDone }: { order: PurchaseOrderDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const locations = useApi(() => api.get<Location[]>('/inventory/locations'), []);
  const options = (locations.data ?? []).filter((l) => l.active && l.branchId === order.branchId);
  const [locationId, setLocation] = useState('');
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(order.items.map((i) => [i.id, String(Math.max(0, i.quantity - i.receivedQty))])));
  const [documentNumber, setDoc] = useState('');
  const [dueDate, setDue] = useState('');
  const [key] = useState(idempotencyKey);
  const [busy, setBusy] = useState(false);
  const items = order.items.map((i) => ({ itemId: i.id, quantity: Number((qty[i.id] ?? '').replace(',', '.')) })).filter((i) => i.quantity > 0);
  return (
    <Modal open onClose={onClose} size="lg" title={`Receber pedido ${order.number}`} description="Cada item recebido entra no estoque pelo custo do pedido."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!(locationId || options[0]) || !items.length} onClick={async () => {
        setBusy(true);
        try { await api.post(`/purchase-orders/${order.id}/receive`, { locationId: locationId || options[0]!.id, items, documentNumber: documentNumber || undefined, dueDate: dueDate || undefined, idempotencyKey: key }); toast.success('Recebimento registrado'); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Confirmar recebimento</Button></>}>
      <div className="stack">
        <FormGrid>
          <Field label="Local de entrada" required className="span-4"><Select value={locationId || options[0]?.id || ''} onChange={(e) => setLocation(e.target.value)} options={options.map((l) => ({ value: l.id, label: l.name }))} /></Field>
          <Field label="Nota fiscal" className="span-4"><Input value={documentNumber} onChange={(e) => setDoc(e.target.value)} /></Field>
          <Field label="Vencimento da conta" className="span-4" hint="Padrão: 30 dias."><Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
        </FormGrid>
        <table className="nc-table">
          <thead><tr><th>Produto</th><th className="num">Pendente</th><th className="num">Receber agora</th></tr></thead>
          <tbody>{order.items.map((i) => (
            <tr key={i.id}>
              <td className="small">{i.product?.description}</td>
              <td className="num">{dec(i.quantity - i.receivedQty)}</td>
              <td className="num"><input className="nc-input" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" value={qty[i.id] ?? ''} aria-label={`Receber ${i.product?.description}`} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value.replace(/[^\d,.]/g, '') })} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Modal>
  );
}
