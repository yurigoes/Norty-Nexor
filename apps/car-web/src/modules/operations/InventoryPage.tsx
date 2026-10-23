/* =========================================================
   Estoque: produtos e saldos, movimentações, reposição,
   inventário físico e consumo. Toda variação de saldo vai ao
   servidor com chave de idempotência: clicar duas vezes não
   baixa duas vezes.
   ========================================================= */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Boxes, ClipboardList, Package, Plus, Undo2 } from 'lucide-react';
import {
  MOVEMENT_TYPE_LABEL, type MovementRow, type MovementType, type Paginated, type ProductRow, type ReplenishmentRow,
} from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, LoadingBlock, Page, PageHeader, Plate, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Modal, useConfirm } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { BarChart } from '../../components/charts';
import { useToast } from '../../components/toast';
import { api, errorMessage, idempotencyKey } from '../../lib/api';
import { useApi, useDebounced, useQueryState } from '../../lib/hooks';
import { dateTime, dec, money } from '../../lib/format';
import { loadDrivers, loadSuppliers, loadVehicles, loadWorkOrders } from '../../lib/pickers';
import { useSession } from '../../lib/session';

interface Category { id: string; name: string }
interface Location { id: string; name: string; branchId: string; active: boolean; branch: { name: string } }

type Tab = 'products' | 'movements' | 'replenishment' | 'counts' | 'consumption';

export function InventoryPage() {
  const { can } = useSession();
  const [productFilter, setProductFilter] = useQueryState('produto');
  // Link com ?produto= (alerta de estoque mínimo) abre direto no extrato.
  const [tab, setTab] = useState<Tab>(productFilter ? 'movements' : 'products');
  const locations = useApi(() => api.get<Location[]>('/inventory/locations'), []);
  const categories = useApi(() => api.get<Category[]>('/inventory/categories'), []);

  return (
    <Page>
      <PageHeader title="Estoque" description="Peças, materiais e saldos por almoxarifado. Saldo negativo não é permitido e cada movimento fica registrado." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'products', label: 'Produtos e saldos' },
        { value: 'movements', label: 'Movimentações' },
        { value: 'replenishment', label: 'Reposição' },
        { value: 'counts', label: 'Inventário físico', hidden: !can('inventory.adjust') && !can('inventory.view') },
        { value: 'consumption', label: 'Consumo' },
      ]} />
      {tab === 'products' && <ProductsTab locations={locations.data ?? []} categories={categories.data ?? []} reloadCategories={categories.reload}
        onExtract={(id) => { setProductFilter(id); setTab('movements'); }} />}
      {tab === 'movements' && <MovementsTab productId={productFilter} clearProduct={() => setProductFilter('')} locations={locations.data ?? []} />}
      {tab === 'replenishment' && <ReplenishmentTab />}
      {tab === 'counts' && <CountsTab locations={locations.data ?? []} />}
      {tab === 'consumption' && <ConsumptionTab />}
    </Page>
  );
}

/* ---------------- Produtos ---------------- */

function ProductsTab({ locations, categories, reloadCategories, onExtract }: {
  locations: Location[]; categories: Category[]; reloadCategories: () => void; onExtract: (id: string) => void;
}) {
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [categoryId, setCategory] = useState('');
  const [lowStock, setLow] = useState(false);
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<ProductRow>>('/inventory/products', { q: term, categoryId, lowStock: lowStock || undefined, page, pageSize: 25 }), [term, categoryId, lowStock, page]);
  const [editing, setEditing] = useState<ProductRow | 'new' | null>(null);
  const [moving, setMoving] = useState<ProductRow | null>(null);
  const [transferring, setTransferring] = useState<ProductRow | null>(null);

  const columns: Column<ProductRow>[] = [
    { key: 'desc', header: 'Produto', render: (p) => <div><div className="strong">{p.description}</div><div className="xsmall muted"><span className="mono">{p.sku}</span>{p.brand ? ` · ${p.brand}` : ''}{p.barcode ? ` · ${p.barcode}` : ''}</div></div> },
    { key: 'cat', header: 'Categoria', render: (p) => <span className="small">{p.category.name}</span> },
    { key: 'stock', header: 'Saldo', align: 'right', render: (p) => <div><div className="strong">{dec(p.stock)} {p.unit}</div><div className="xsmall muted">{p.balances.filter((b) => b.quantity).map((b) => `${b.location}: ${dec(b.quantity)}`).join(' · ') || 'sem saldo'}</div></div> },
    { key: 'min', header: 'Mínimo', align: 'right', render: (p) => <span>{dec(p.minStock)}{p.belowMin && <> <Badge tone="danger">Abaixo</Badge></>}</span> },
    { key: 'cost', header: 'Custo médio', align: 'right', render: (p) => money(p.averageCost) },
    { key: 'actions', header: '', render: (p) => (
      <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }} onClick={(e) => e.stopPropagation()}>
        {can('inventory.move') && <Button size="sm" onClick={() => setMoving(p)}>Movimentar</Button>}
        {can('inventory.move') && <Button size="sm" variant="ghost" icon={ArrowLeftRight} aria-label="Transferir" onClick={() => setTransferring(p)} />}
        <Button size="sm" variant="ghost" onClick={() => onExtract(p.id)}>Extrato</Button>
      </div>
    ) },
  ];

  return (
    <>
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={can('inventory.manage') ? setEditing : undefined}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Código, descrição ou código de barras" />
            <select className="nc-select" style={{ width: 'auto' }} value={categoryId} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Checkbox label="Só abaixo do mínimo" checked={lowStock} onChange={(e) => { setLow(e.target.checked); setPage(1); }} />
            <span className="grow" />
            {can('inventory.manage') && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Novo produto</Button>}
          </>}
          empty={{ title: 'Nenhum produto', description: 'Cadastre peças e materiais para controlar saldo e consumo.', icon: Package }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {editing && <ProductModal product={editing === 'new' ? null : editing} categories={categories} reloadCategories={reloadCategories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      {moving && <MoveModal product={moving} locations={locations} onClose={() => setMoving(null)} onDone={() => { setMoving(null); list.reload(); }} />}
      {transferring && <TransferModal product={transferring} locations={locations} onClose={() => setTransferring(null)} onDone={() => { setTransferring(null); list.reload(); }} />}
    </>
  );
}

function ProductModal({ product, categories, reloadCategories, onClose, onSaved }: {
  product: ProductRow | null; categories: Category[]; reloadCategories: () => void; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    sku: product?.sku ?? '', barcode: product?.barcode ?? '', description: product?.description ?? '', categoryId: product?.categoryId ?? '',
    brand: product?.brand ?? '', manufacturer: product?.manufacturer ?? '', unit: product?.unit ?? 'UN', reference: product?.reference ?? '',
    referencePrice: product?.referencePrice ?? ('' as number | ''), minStock: product?.minStock ?? 0, maxStock: product?.maxStock ?? ('' as number | ''),
    trackLot: product?.trackLot ?? false, trackExpiry: product?.trackExpiry ?? false, active: product?.active ?? true,
  });
  const [supplierId, setSupplier] = useState<string | null>(product?.supplierId ?? null);
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        barcode: opt(f.barcode) ?? null, description: f.description, categoryId: f.categoryId, brand: opt(f.brand) ?? null, manufacturer: opt(f.manufacturer) ?? null,
        unit: f.unit, reference: opt(f.reference) ?? null, supplierId, referencePrice: f.referencePrice === '' ? null : f.referencePrice,
        minStock: Number(f.minStock) || 0, maxStock: f.maxStock === '' ? null : Number(f.maxStock), trackLot: f.trackLot, trackExpiry: f.trackExpiry,
      };
      if (product) await api.patch(`/inventory/products/${product.id}`, { ...body, active: f.active });
      else await api.post('/inventory/products', { ...body, sku: f.sku, barcode: opt(f.barcode), supplierId: supplierId ?? undefined, referencePrice: body.referencePrice ?? undefined, maxStock: body.maxStock ?? undefined, brand: body.brand ?? undefined, manufacturer: body.manufacturer ?? undefined, reference: body.reference ?? undefined });
      toast.success(product ? 'Produto atualizado' : 'Produto cadastrado');
      onSaved();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  const createCategory = async () => {
    try {
      const c = await api.post<Category>('/inventory/categories', { name: newCategory });
      reloadCategories();
      setF({ ...f, categoryId: c.id });
      setNewCategory('');
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={product ? product.description : 'Novo produto'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.description || !f.categoryId || (!product && !f.sku)} onClick={save}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Código interno" required className="span-4"><Input value={f.sku} onChange={set('sku')} disabled={Boolean(product)} /></Field>
        <Field label="Código de barras" className="span-4"><Input value={f.barcode} onChange={set('barcode')} inputMode="numeric" /></Field>
        <Field label="Unidade" required className="span-4"><Select value={f.unit} onChange={set('unit')} options={['UN', 'L', 'KG', 'M', 'CX', 'PAR', 'JG'].map((u) => ({ value: u, label: u }))} /></Field>
        <Field label="Descrição" required className="span-8"><Input value={f.description} onChange={set('description')} /></Field>
        <Field label="Categoria" required className="span-4"><Select value={f.categoryId} onChange={set('categoryId')} placeholder="Selecione" options={categories.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <div className="span-12 row">
          <Input placeholder="Nova categoria" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ maxWidth: 260 }} aria-label="Nova categoria" />
          <Button size="sm" disabled={newCategory.trim().length < 2} onClick={createCategory}>Criar categoria</Button>
        </div>
        <Field label="Marca" className="span-4"><Input value={f.brand} onChange={set('brand')} /></Field>
        <Field label="Fabricante" className="span-4"><Input value={f.manufacturer} onChange={set('manufacturer')} /></Field>
        <Field label="Referência" className="span-4"><Input value={f.reference} onChange={set('reference')} /></Field>
        <Field label="Fornecedor preferencial" className="span-6"><EntityPicker value={supplierId} onChange={(v) => setSupplier(v)} load={loadSuppliers()} initialLabel={product?.supplier?.name} /></Field>
        <Field label="Preço de referência" className="span-6"><MoneyInput value={f.referencePrice} onChange={(v) => setF({ ...f, referencePrice: v })} /></Field>
        <Field label="Estoque mínimo" className="span-6" hint="Abaixo disso, alerta e sugestão de compra."><Input type="number" min={0} step="any" value={f.minStock} onChange={set('minStock')} /></Field>
        <Field label="Estoque máximo" className="span-6"><Input type="number" min={0} step="any" value={f.maxStock} onChange={set('maxStock')} /></Field>
        <div className="span-12 row">
          <Checkbox label="Controla lote" checked={f.trackLot} onChange={(e) => setF({ ...f, trackLot: e.target.checked })} />
          <Checkbox label="Controla validade" checked={f.trackExpiry} onChange={(e) => setF({ ...f, trackExpiry: e.target.checked })} />
          {product && <Checkbox label="Ativo" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />}
        </div>
      </FormGrid>
    </Modal>
  );
}

const MOVE_TYPES: { value: MovementType; label: string; adjust?: boolean }[] = [
  { value: 'MAINTENANCE_OUT', label: MOVEMENT_TYPE_LABEL.MAINTENANCE_OUT },
  { value: 'VEHICLE_OUT', label: MOVEMENT_TYPE_LABEL.VEHICLE_OUT },
  { value: 'DRIVER_OUT', label: MOVEMENT_TYPE_LABEL.DRIVER_OUT },
  { value: 'RETURN_IN', label: MOVEMENT_TYPE_LABEL.RETURN_IN },
  { value: 'MANUAL_IN', label: MOVEMENT_TYPE_LABEL.MANUAL_IN, adjust: true },
  { value: 'LOSS', label: MOVEMENT_TYPE_LABEL.LOSS, adjust: true },
  { value: 'ADJUSTMENT', label: MOVEMENT_TYPE_LABEL.ADJUSTMENT, adjust: true },
];

function MoveModal({ product, locations, onClose, onDone }: { product: ProductRow; locations: Location[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const types = MOVE_TYPES.filter((t) => !t.adjust || can('inventory.adjust'));
  const [type, setType] = useState<MovementType>(types[0]!.value);
  const [locationId, setLocation] = useState(locations.find((l) => l.active)?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState<number | ''>(product.lastCost || '');
  const [vehicleUnitId, setVehicle] = useState<string | null>(null);
  const [workOrderId, setWorkOrder] = useState<string | null>(null);
  const [driverId, setDriver] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // A chave nasce com o formulário: reenviar o mesmo formulário não duplica.
  const [key] = useState(idempotencyKey);
  const [busy, setBusy] = useState(false);
  const qty = Number(quantity.replace(',', '.'));
  const out = ['MAINTENANCE_OUT', 'VEHICLE_OUT', 'DRIVER_OUT', 'LOSS'].includes(type);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/inventory/movements', {
        productId: product.id, locationId, type, quantity: qty,
        unitCost: type === 'MANUAL_IN' || (type === 'ADJUSTMENT' && qty > 0 && unitCost !== '') ? (unitCost === '' ? undefined : unitCost) : undefined,
        vehicleUnitId: vehicleUnitId ?? undefined, workOrderId: workOrderId ?? undefined, driverId: driverId ?? undefined,
        reason: reason || undefined, idempotencyKey: key,
      });
      toast.success('Movimentação registrada');
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  const balance = product.balances.find((b) => b.locationId === locationId)?.quantity ?? 0;
  return (
    <Modal open onClose={onClose} size="lg" title={`Movimentar: ${product.description}`} description={`Saldo neste local: ${dec(balance)} ${product.unit}`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!locationId || !qty || (type !== 'ADJUSTMENT' && qty < 0) || ((type === 'LOSS' || type === 'ADJUSTMENT') && reason.trim().length < 3)} onClick={submit}>Registrar</Button></>}>
      <FormGrid>
        <Field label="Tipo" required className="span-6"><Select value={type} onChange={(e) => setType(e.target.value as MovementType)} options={types} /></Field>
        <Field label="Local" required className="span-6"><Select value={locationId} onChange={(e) => setLocation(e.target.value)} options={locations.filter((l) => l.active).map((l) => ({ value: l.id, label: `${l.name} · ${l.branch.name}` }))} /></Field>
        <Field label="Quantidade" required className="span-6" hint={type === 'ADJUSTMENT' ? 'Negativo baixa, positivo acrescenta.' : undefined}>
          <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d,.-]/g, ''))} />
        </Field>
        {(type === 'MANUAL_IN' || type === 'ADJUSTMENT') && <Field label="Custo unitário" required={type === 'MANUAL_IN'} className="span-6"><MoneyInput value={unitCost} onChange={setUnitCost} /></Field>}
        {out && type !== 'LOSS' && <Field label="Placa" className="span-6" hint="Obrigatória conforme a configuração da empresa."><EntityPicker value={vehicleUnitId} onChange={(v) => setVehicle(v)} load={loadVehicles()} /></Field>}
        {(type === 'MAINTENANCE_OUT' || type === 'RETURN_IN') && <Field label="Ordem de serviço" className="span-6"><EntityPicker value={workOrderId} onChange={(v) => setWorkOrder(v)} load={loadWorkOrders({ open: 'true' })} /></Field>}
        {type === 'DRIVER_OUT' && <Field label="Motorista" required className="span-6"><EntityPicker value={driverId} onChange={(v) => setDriver(v)} load={loadDrivers()} /></Field>}
        <Field label="Motivo" required={type === 'LOSS' || type === 'ADJUSTMENT'} className="span-12"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
      </FormGrid>
    </Modal>
  );
}

function TransferModal({ product, locations, onClose, onDone }: { product: ProductRow; locations: Location[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const active = locations.filter((l) => l.active);
  const [from, setFrom] = useState(product.balances.find((b) => b.quantity > 0)?.locationId ?? active[0]?.id ?? '');
  const [to, setTo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [key] = useState(idempotencyKey);
  const [busy, setBusy] = useState(false);
  const qty = Number(quantity.replace(',', '.'));
  return (
    <Modal open onClose={onClose} title={`Transferir: ${product.description}`} description="Saída e entrada acontecem juntas: ou as duas, ou nenhuma."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!from || !to || from === to || !(qty > 0)} onClick={async () => {
        setBusy(true);
        try { await api.post('/inventory/transfers', { productId: product.id, fromLocationId: from, toLocationId: to, quantity: qty, reason: reason || undefined, idempotencyKey: key }); toast.success('Transferência registrada'); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Transferir</Button></>}>
      <div className="stack">
        <Field label="Origem" required><Select value={from} onChange={(e) => setFrom(e.target.value)} options={active.map((l) => ({ value: l.id, label: `${l.name} · ${l.branch.name} (${dec(product.balances.find((b) => b.locationId === l.id)?.quantity ?? 0)})` }))} /></Field>
        <Field label="Destino" required><Select value={to} onChange={(e) => setTo(e.target.value)} placeholder="Selecione" options={active.filter((l) => l.id !== from).map((l) => ({ value: l.id, label: `${l.name} · ${l.branch.name}` }))} /></Field>
        <Field label="Quantidade" required><Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d,.]/g, ''))} /></Field>
        <Field label="Observação"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- Movimentações ---------------- */

function MovementsTab({ productId, clearProduct, locations }: { productId: string; clearProduct: () => void; locations: Location[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const [type, setType] = useState('');
  const [locationId, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi(() => api.get<Paginated<MovementRow>>('/inventory/movements', { productId, type, locationId, page, pageSize: 50 }), [productId, type, locationId, page]);
  const columns: Column<MovementRow>[] = [
    { key: 'at', header: 'Quando', render: (m) => <span className="small nowrap">{dateTime(m.at)}</span> },
    { key: 'product', header: 'Produto', render: (m) => <div><div className="small strong">{m.product.description}</div><div className="xsmall muted mono">{m.product.sku}</div></div> },
    { key: 'type', header: 'Tipo', render: (m) => <div><div className="small">{MOVEMENT_TYPE_LABEL[m.type]}</div>{m.reversalOfId && <Badge tone="warning">Estorno</Badge>}</div> },
    { key: 'loc', header: 'Local', render: (m) => <span className="small">{m.location}{m.counterpartLocation ? ` ${m.quantity < 0 ? '→' : '←'} ${m.counterpartLocation}` : ''}</span> },
    { key: 'link', header: 'Vínculo', render: (m) => m.vehicle ? <Plate value={m.vehicle.plate} /> : <span className="muted">—</span> },
    { key: 'qty', header: 'Quantidade', align: 'right', render: (m) => <span className={m.quantity < 0 ? 'text-danger' : 'text-success'}>{m.quantity > 0 ? '+' : ''}{dec(m.quantity)}</span> },
    { key: 'cost', header: 'Custo', align: 'right', render: (m) => money(m.totalCost) },
    { key: 'bal', header: 'Saldo após', align: 'right', render: (m) => dec(m.balanceAfter) },
    { key: 'actions', header: '', render: (m) => can('inventory.adjust') && !m.reversalOfId && !m.transferGroupId ? (
      <Button size="sm" variant="ghost" icon={Undo2} aria-label="Estornar" onClick={async (e) => {
        e.stopPropagation();
        const r = await confirm({ title: 'Estornar movimentação', message: 'Será registrado um movimento oposto. O original permanece no histórico.', requireReason: true, confirmLabel: 'Estornar' });
        if (!r.confirmed) return;
        api.post(`/inventory/movements/${m.id}/reverse`, { reason: r.reason, idempotencyKey: idempotencyKey() }).then(() => { toast.success('Estorno registrado'); list.reload(); }).catch((err) => toast.error(errorMessage(err)));
      }} />
    ) : null },
  ];
  return (
    <Card flush>
      <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
        toolbar={<>
          {productId && <Button size="sm" onClick={clearProduct}>Limpar filtro de produto</Button>}
          <select className="nc-select" style={{ width: 'auto' }} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {(Object.keys(MOVEMENT_TYPE_LABEL) as MovementType[]).map((t) => <option key={t} value={t}>{MOVEMENT_TYPE_LABEL[t]}</option>)}
          </select>
          <select className="nc-select" style={{ width: 'auto' }} value={locationId} onChange={(e) => { setLocation(e.target.value); setPage(1); }} aria-label="Local">
            <option value="">Todos os locais</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.branch.name}</option>)}
          </select>
        </>}
        empty={{ title: 'Nenhuma movimentação', icon: Boxes }}
        footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
    </Card>
  );
}

/* ---------------- Reposição ---------------- */

function ReplenishmentTab() {
  const list = useApi(() => api.get<ReplenishmentRow[]>('/inventory/replenishment'), []);
  const total = useMemo(() => (list.data ?? []).reduce((a, r) => a + r.estimatedCost, 0), [list.data]);
  const columns: Column<ReplenishmentRow & { id: string }>[] = [
    { key: 'p', header: 'Produto', render: (r) => <div><div className="strong">{r.description}</div><div className="xsmall muted mono">{r.sku}</div></div> },
    { key: 's', header: 'Saldo / mínimo', align: 'right', render: (r) => <span className="text-danger">{dec(r.stock)} / {dec(r.minStock)} {r.unit}</span> },
    { key: 'c', header: 'Consumo diário (90 dias)', align: 'right', render: (r) => dec(r.dailyConsumption) },
    { key: 'q', header: 'Sugestão de compra', align: 'right', render: (r) => <strong>{dec(r.suggestedQty)} {r.unit}</strong> },
    { key: 'v', header: 'Custo estimado', align: 'right', render: (r) => money(r.estimatedCost) },
    { key: 'f', header: 'Fornecedor', render: (r) => r.supplier?.name ?? <span className="muted">—</span> },
  ];
  return (
    <div className="stack">
      {list.data && list.data.length > 0 && <Alert tone="warning">{list.data.length} produto(s) abaixo do mínimo. Reposição estimada em {money(total)} pelo último custo de compra. Gere o pedido em Compras.</Alert>}
      <Card flush>
        <DataTable columns={columns} rows={list.data?.map((r) => ({ ...r, id: r.productId }))} loading={list.loading} error={list.error} onRetry={list.reload}
          empty={{ title: 'Nenhum produto abaixo do mínimo', description: 'Os produtos com estoque mínimo definido aparecem aqui quando o saldo fica abaixo dele.', icon: Package }} />
      </Card>
    </div>
  );
}

/* ---------------- Inventário físico ---------------- */

interface CountRow { id: string; status: string; location?: string; createdAt: string; appliedAt: string | null; _count: { items: number } }
interface CountDetail { id: string; status: string; location: string; items: { id: string; productId: string; systemQty: number; countedQty: number | null; product?: { sku: string; description: string; unit: string } }[] }

function CountsTab({ locations }: { locations: Location[] }) {
  const toast = useToast();
  const { can } = useSession();
  const list = useApi(() => api.get<CountRow[]>('/inventory/counts'), []);
  const [locationId, setLocation] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      {can('inventory.adjust') && (
        <Card title="Abrir inventário" subtitle="O saldo do sistema é registrado no momento da abertura; a diferença para o contado vira ajuste ao aplicar.">
          <div className="row">
            <select className="nc-select" style={{ maxWidth: 320 }} value={locationId} onChange={(e) => setLocation(e.target.value)} aria-label="Local">
              <option value="">Escolha o local</option>
              {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name} · {l.branch.name}</option>)}
            </select>
            <Button variant="primary" icon={ClipboardList} disabled={!locationId} onClick={() => api.post<{ id: string }>('/inventory/counts', { locationId }).then((c) => { list.reload(); setOpen(c.id); }).catch((e) => toast.error(errorMessage(e)))}>Abrir contagem</Button>
          </div>
        </Card>
      )}
      <Card flush>
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(c) => setOpen(c.id)}
          empty={{ title: 'Nenhum inventário', icon: ClipboardList }}
          columns={[
            { key: 'loc', header: 'Local', render: (c) => <span className="strong">{c.location}</span> },
            { key: 'items', header: 'Itens', align: 'right', render: (c) => c._count.items },
            { key: 'at', header: 'Aberto em', render: (c) => dateTime(c.createdAt) },
            { key: 'applied', header: 'Aplicado em', render: (c) => dateTime(c.appliedAt) },
            { key: 's', header: 'Situação', render: (c) => <Badge tone={c.status === 'OPEN' ? 'warning' : c.status === 'APPLIED' ? 'success' : 'neutral'}>{c.status === 'OPEN' ? 'Em contagem' : c.status === 'APPLIED' ? 'Aplicado' : 'Cancelado'}</Badge> },
          ]} />
      </Card>
      {open && <CountModal id={open} onClose={() => { setOpen(null); list.reload(); }} />}
    </div>
  );
}

function CountModal({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const detail = useApi(() => api.get<CountDetail>(`/inventory/counts/${id}`), [id]);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  useEffect(() => {
    if (detail.data) setCounted(Object.fromEntries(detail.data.items.map((i) => [i.productId, i.countedQty === null ? '' : String(i.countedQty)])));
  }, [detail.data]);
  const d = detail.data;
  const editable = d?.status === 'OPEN' && can('inventory.adjust');
  const save = async () => {
    const items = Object.entries(counted).filter(([, v]) => v !== '').map(([productId, v]) => ({ productId, countedQty: Number(v.replace(',', '.')) }));
    await api.patch(`/inventory/counts/${id}`, { items });
  };
  return (
    <Modal open onClose={onClose} size="xl" title={d ? `Inventário · ${d.location}` : 'Inventário'}
      footer={editable ? <>
        <Button onClick={() => api.post(`/inventory/counts/${id}/cancel`).then(onClose).catch((e) => toast.error(errorMessage(e)))}>Cancelar inventário</Button>
        <span className="grow" />
        <Button onClick={() => save().then(() => toast.success('Contagem salva')).catch((e) => toast.error(errorMessage(e)))}>Salvar contagem</Button>
        <Button variant="primary" onClick={async () => {
          const r = await confirm({ title: 'Aplicar inventário', message: 'As diferenças entre o contado e o saldo atual viram ajustes de inventário. Itens sem contagem são ignorados.', tone: 'primary', confirmLabel: 'Aplicar' });
          if (!r.confirmed) return;
          try { await save(); const res = await api.post<{ adjustments: number }>(`/inventory/counts/${id}/apply`); toast.success('Inventário aplicado', `${res.adjustments} ajuste(s) registrado(s).`); onClose(); }
          catch (e) { toast.error(errorMessage(e)); }
        }}>Aplicar</Button>
      </> : undefined}>
      {!d ? <LoadingBlock /> : (
        <div className="stack">
          <SearchInput value={q} onChange={setQ} placeholder="Filtrar produto" />
          <div className="nc-table-wrap" style={{ maxHeight: 460 }}>
            <table className="nc-table">
              <thead><tr><th>Produto</th><th className="num">Sistema (na abertura)</th><th className="num">Contado</th><th className="num">Diferença</th></tr></thead>
              <tbody>
                {d.items.filter((i) => !q || `${i.product?.sku} ${i.product?.description}`.toLowerCase().includes(q.toLowerCase())).map((i) => {
                  const value = counted[i.productId] ?? '';
                  const diff = value === '' ? null : Number(value.replace(',', '.')) - i.systemQty;
                  return (
                    <tr key={i.id}>
                      <td><div className="small strong">{i.product?.description}</div><div className="xsmall muted mono">{i.product?.sku}</div></td>
                      <td className="num">{dec(i.systemQty)} {i.product?.unit}</td>
                      <td className="num">{editable ? <input className="nc-input" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" value={value} aria-label={`Contado de ${i.product?.description}`} onChange={(e) => setCounted({ ...counted, [i.productId]: e.target.value.replace(/[^\d,.]/g, '') })} /> : dec(i.countedQty)}</td>
                      <td className={`num ${diff ? (diff < 0 ? 'text-danger' : 'text-success') : ''}`}>{diff === null ? '—' : `${diff > 0 ? '+' : ''}${dec(diff)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!d.items.length && <EmptyState title="Nenhum produto ativo para contar" />}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Consumo ---------------- */

function ConsumptionTab() {
  const [groupBy, setGroupBy] = useState<'vehicle' | 'branch' | 'category' | 'product'>('category');
  const data = useApi(() => api.get<{ rows: { key: string; label: string; quantity: number; totalCost: number; movements: number }[] }>('/inventory/consumption', { groupBy }), [groupBy]);
  const rows = data.data?.rows ?? [];
  return (
    <Card title="Consumo dos últimos 90 dias" subtitle="Saídas para manutenção, placa e motorista, mais perdas, pelo custo médio na data."
      actions={<select className="nc-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} aria-label="Agrupar por">
        <option value="category">Por categoria</option><option value="vehicle">Por veículo</option><option value="branch">Por loja</option><option value="product">Por produto</option>
      </select>}>
      {data.loading && !data.data ? <LoadingBlock /> : !rows.length ? <EmptyState title="Sem consumo no período" icon={Boxes} /> : (
        <div className="stack">
          <BarChart labels={rows.slice(0, 10).map((r) => r.label.slice(0, 14))} series={[{ name: 'Custo', values: rows.slice(0, 10).map((r) => r.totalCost) }]} format={(v) => money(v)} />
          <table className="nc-table">
            <thead><tr><th>Grupo</th><th className="num">Quantidade</th><th className="num">Movimentos</th><th className="num">Custo</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num">{dec(r.quantity)}</td><td className="num">{r.movements}</td><td className="num">{money(r.totalCost)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
