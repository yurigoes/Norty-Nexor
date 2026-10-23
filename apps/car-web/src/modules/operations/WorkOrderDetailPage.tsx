import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, Plus, Trash2, XCircle } from 'lucide-react';
import {
  PRIORITY_LABEL, WORK_ORDER_ITEM_TYPE_LABEL, WORK_ORDER_STATUS_LABEL,
  type WorkOrderDetail, type WorkOrderItemType, type WorkOrderStatus,
} from '@nortycar/shared';
import { Alert, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Plate, Timeline } from '../../components/ui';
import { Field, FormGrid, Input, MoneyInput, Select } from '../../components/form';
import { Modal, useConfirm } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Attachments } from '../../components/files';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage, idempotencyKey } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, dateTime, dec, km, money } from '../../lib/format';
import { loadProducts } from '../../lib/pickers';
import { useSession } from '../../lib/session';

interface Location { id: string; name: string; branchId: string; active: boolean; branch: { name: string } }

export function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const wo = useApi(() => api.get<WorkOrderDetail>(`/work-orders/${id}`), [id]);
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [nextStatus, setNext] = useState('');

  if (wo.loading && !wo.data) return <LoadingBlock />;
  if (wo.error || !wo.data) return <ErrorState message={wo.error ?? 'OS não encontrada'} onRetry={wo.reload} />;
  const w = wo.data;
  const open = !['COMPLETED', 'CANCELLED'].includes(w.status);

  const post = (path: string, body: unknown, done: string) => api.post(`/work-orders/${id}/${path}`, body).then(() => { toast.success(done); wo.reload(); }).catch((e) => toast.error(errorMessage(e)));

  return (
    <Page>
      <PageHeader
        breadcrumb={<><Link to="/operacao/ordens-servico">Ordens de serviço</Link> / {w.number}</>}
        title={<span className="row">{w.number} <Status kind="workOrder" value={w.status} /></span>}
        description={<span className="row"><Plate value={w.vehicle.plate} /> {w.vehicle.model.make.name} {w.vehicle.model.name} · {w.serviceType.name}</span>}
        actions={<>
          {open && w.status === 'AWAITING_APPROVAL' && can('maintenance.approve') && (
            <Button variant="primary" icon={CheckCircle2} onClick={async () => {
              const r = await confirm({ title: 'Aprovar orçamento', message: `Aprovar ${money(w.estimateAmount)} para esta OS, dentro da sua alçada.`, tone: 'primary', confirmLabel: 'Aprovar' });
              if (r.confirmed) post('approve', {}, 'Orçamento aprovado');
            }}>Aprovar orçamento</Button>
          )}
          {w.status === 'IN_PROGRESS' && can('maintenance.manage') && <Button variant="success" icon={CheckCircle2} onClick={() => setCompleting(true)}>Concluir</Button>}
          {w.status === 'COMPLETED' && !w.releasedAt && can('maintenance.release') && (
            <Button variant="primary" icon={KeyRound} onClick={async () => {
              const r = await confirm({ title: 'Liberar veículo', message: 'O veículo volta à agenda e à situação "Liberado".', tone: 'primary', confirmLabel: 'Liberar' });
              if (r.confirmed) post('release', {}, 'Veículo liberado');
            }}>Liberar veículo</Button>
          )}
          {open && can('maintenance.manage') && (
            <Button variant="danger" icon={XCircle} onClick={async () => {
              const r = await confirm({ title: 'Cancelar OS', message: 'Peças já baixadas não voltam ao estoque sozinhas: registre a devolução no estoque.', requireReason: true, confirmLabel: 'Cancelar OS' });
              if (r.confirmed) post('cancel', { reason: r.reason }, 'OS cancelada');
            }}>Cancelar</Button>
          )}
        </>}
      />
      {w.exceedsApproval && open && <Alert tone="warning">O custo lançado ({money(w.totalCost)}) já passa do aprovado ({money(w.approvedAmount)}). A conclusão vai exigir nova aprovação de quem tem alçada.</Alert>}
      {w.status === 'COMPLETED' && !w.releasedAt && <Alert tone="info">Serviço concluído. O veículo aguarda liberação para voltar à operação.</Alert>}
      {w.cancelReason && <Alert tone="neutral" title="Cancelada">{w.cancelReason}</Alert>}

      <div className="grid-2">
        <Card title="Dados">
          <KeyValue items={[
            { label: 'Natureza', value: w.kind === 'PREVENTIVE' ? 'Preventiva' : 'Corretiva' },
            { label: 'Prioridade', value: PRIORITY_LABEL[w.priority] },
            { label: 'Aberta em', value: dateTime(w.openedAt) },
            { label: 'Prazo', value: <span className={w.overdue ? 'text-danger' : undefined}>{dateTime(w.dueAt)}</span> },
            { label: 'Quilometragem', value: km(w.odometerKm) },
            { label: 'Oficina', value: w.supplier?.name ?? 'Equipe própria' },
            { label: 'Agenda do veículo', value: w.allocation ? `${w.allocation.active ? 'Bloqueada' : 'Liberada'} até ${dateTime(w.allocation.endsAt)}` : 'Sem bloqueio' },
            { label: 'Sinistro', value: w.claim ? `${w.claim.number}` : '—', hidden: !w.claim },
            { label: 'Concluída em', value: dateTime(w.completedAt), hidden: !w.completedAt },
            { label: 'Nota fiscal', value: w.invoiceNumber ?? '—', hidden: !w.invoiceNumber },
          ]} />
          <p className="small" style={{ marginTop: 'var(--space-4)' }}>{w.description}</p>
        </Card>
        <Card title="Custos">
          <KeyValue items={[
            { label: 'Orçamento', value: money(w.estimateAmount) },
            { label: 'Aprovado', value: w.approvedAmount === null ? 'Não aprovado' : money(w.approvedAmount) },
            { label: 'Peças', value: money(w.partsCost) },
            { label: 'Mão de obra', value: money(w.laborCost) },
            { label: 'Serviços e despesas', value: money(w.otherCost) },
            { label: 'Total', value: <strong>{money(w.totalCost)}</strong> },
          ]} />
          {w.payables.length > 0 && <div className="small muted" style={{ marginTop: 'var(--space-3)' }}>Conta a pagar gerada: {w.payables.map((p) => `${money(p.amount)} vence ${date(p.dueDate)}`).join(' · ')}</div>}
          {open && w.allowedTransitions.length > 0 && can('maintenance.manage') && (
            <div className="row" style={{ marginTop: 'var(--space-4)' }}>
              <select className="nc-select" style={{ maxWidth: 240 }} value={nextStatus} onChange={(e) => setNext(e.target.value)} aria-label="Avançar situação">
                <option value="">Mudar situação para…</option>
                {w.allowedTransitions.map((s) => <option key={s} value={s}>{WORK_ORDER_STATUS_LABEL[s]}</option>)}
              </select>
              <Button disabled={!nextStatus} onClick={() => { post('status', { to: nextStatus as WorkOrderStatus }, 'Situação atualizada'); setNext(''); }}>Aplicar</Button>
            </div>
          )}
        </Card>
      </div>

      <Card title="Itens" flush actions={open && can('maintenance.manage') && <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>Adicionar item</Button>}>
        {!w.items.length ? <div className="nc-empty"><span className="muted">Nenhum item lançado. Peças do estoque, mão de obra, serviços de terceiros e despesas entram aqui.</span></div> : (
          <table className="nc-table">
            <thead><tr><th>Tipo</th><th>Descrição</th><th className="num">Qtd.</th><th className="num">Unitário</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {w.items.map((i) => (
                <tr key={i.id}>
                  <td className="small">{WORK_ORDER_ITEM_TYPE_LABEL[i.type]}</td>
                  <td><div className="small">{i.description}</div>{i.product && <div className="xsmall muted mono">{i.product.sku}</div>}</td>
                  <td className="num">{dec(i.quantity)}{i.product ? ` ${i.product.unit}` : ''}</td>
                  <td className="num">{money(i.unitCost)}</td>
                  <td className="num">{money(i.total)}</td>
                  <td className="actions">{open && i.type !== 'PART' && can('maintenance.manage') && (
                    <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remover item" onClick={() => api.del(`/work-orders/${id}/items/${i.id}`).then(wo.reload).catch((e) => toast.error(errorMessage(e)))} />
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Histórico">
          <Timeline items={w.events.map((e) => ({ id: e.id, title: WORK_ORDER_STATUS_LABEL[e.toStatus as WorkOrderStatus] ?? e.toStatus, meta: dateTime(e.at), description: e.note }))} />
        </Card>
        <Card><Attachments entityType="WorkOrder" entityId={w.id} canWrite={can('maintenance.manage')} title="Orçamentos, notas e fotos"
          categories={[{ value: 'orcamento', label: 'Orçamento' }, { value: 'nota_fiscal', label: 'Nota fiscal' }, { value: 'foto', label: 'Foto' }, { value: 'outro', label: 'Outro' }]} /></Card>
      </div>

      {adding && <AddItemModal wo={w} onClose={() => setAdding(false)} onDone={() => { setAdding(false); wo.reload(); }} />}
      {completing && <CompleteModal wo={w} onClose={() => setCompleting(false)} onDone={() => { setCompleting(false); wo.reload(); }} />}
    </Page>
  );
}

function AddItemModal({ wo, onClose, onDone }: { wo: WorkOrderDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const locations = useApi(() => api.get<Location[]>('/inventory/locations'), [], can('inventory.view'));
  const types = (Object.keys(WORK_ORDER_ITEM_TYPE_LABEL) as WorkOrderItemType[]).filter((t) => t !== 'PART' || can('inventory.move'));
  const [type, setType] = useState<WorkOrderItemType>(types[0]!);
  const [productId, setProduct] = useState<string | null>(null);
  const [locationId, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState<number | ''>('');
  const [key] = useState(idempotencyKey);
  const [busy, setBusy] = useState(false);
  const local = (locations.data ?? []).filter((l) => l.active && l.branchId === wo.branchId);
  const loc = locationId || local[0]?.id || '';
  const qty = Number(quantity.replace(',', '.'));
  const valid = qty > 0 && (type === 'PART' ? productId && loc : description.trim().length >= 2 && unitCost !== '');
  return (
    <Modal open onClose={onClose} title="Adicionar item à OS"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={async () => {
        setBusy(true);
        try {
          await api.post(`/work-orders/${wo.id}/items`, { type, productId: productId ?? undefined, locationId: type === 'PART' ? loc : undefined, description: description || undefined, quantity: qty, unitCost: type === 'PART' ? undefined : unitCost, idempotencyKey: key });
          toast.success(type === 'PART' ? 'Peça baixada do estoque' : 'Item adicionado');
          onDone();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Adicionar</Button></>}>
      <FormGrid>
        <Field label="Tipo" required className="span-6"><Select value={type} onChange={(e) => setType(e.target.value as WorkOrderItemType)} options={types.map((t) => ({ value: t, label: WORK_ORDER_ITEM_TYPE_LABEL[t] }))} /></Field>
        <Field label="Quantidade" required className="span-6"><Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d,.]/g, ''))} /></Field>
        {type === 'PART' ? <>
          <Field label="Peça" required className="span-12"><EntityPicker value={productId} onChange={(v) => setProduct(v)} load={loadProducts()} /></Field>
          <Field label="Sai do local" required className="span-12" hint="Custo pelo custo médio do produto."><Select value={loc} onChange={(e) => setLocation(e.target.value)} options={local.map((l) => ({ value: l.id, label: l.name }))} /></Field>
        </> : <>
          <Field label="Descrição" required className="span-12"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Valor unitário" required className="span-6"><MoneyInput value={unitCost} onChange={setUnitCost} /></Field>
        </>}
      </FormGrid>
    </Modal>
  );
}

function CompleteModal({ wo, onClose, onDone }: { wo: WorkOrderDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [invoice, setInvoice] = useState(wo.invoiceNumber ?? '');
  const [odometer, setOdometer] = useState(wo.odometerKm?.toString() ?? '');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const thirdParty = wo.laborCost + wo.otherCost;
  return (
    <Modal open onClose={onClose} title={`Concluir ${wo.number}`} description={`Custo total ${money(wo.totalCost)}.`}
      footer={<><Button onClick={onClose}>Voltar</Button><Button variant="success" loading={busy} onClick={async () => {
        setBusy(true);
        try { await api.post(`/work-orders/${wo.id}/complete`, { invoiceNumber: invoice || undefined, odometerKm: odometer ? Number(odometer) : undefined, payableDueDate: due || undefined }); toast.success('OS concluída'); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Concluir</Button></>}>
      <div className="stack">
        {thirdParty > 0 && wo.supplier && <Alert tone="info">Será gerada conta a pagar de {money(thirdParty)} para {wo.supplier.name}.</Alert>}
        <Field label="Nota fiscal"><Input value={invoice} onChange={(e) => setInvoice(e.target.value)} /></Field>
        <Field label="Quilometragem na saída"><Input inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} /></Field>
        {thirdParty > 0 && wo.supplier && <Field label="Vencimento da conta" hint="Padrão: 30 dias."><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>}
      </div>
    </Modal>
  );
}
