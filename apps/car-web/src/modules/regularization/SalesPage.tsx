/* Compra e venda de frota: anúncio, propostas, preparação e conclusão com baixa patrimonial. */
import { useState } from 'react';
import { CheckCircle2, Plus, ReceiptText, Tag, XCircle } from 'lucide-react';
import { SALE_STATUS_LABEL, type Paginated, type SaleDetail, type SaleListItem } from '@nortycar/shared';
import { Alert, Badge, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Tabs } from '../../components/ui';
import { Field, FormGrid, Input, MoneyInput, Textarea } from '../../components/form';
import { DataTable, Pagination, type Column } from '../../components/table';
import { Drawer, Modal, useConfirm } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Status } from '../../components/status';
import { Attachments } from '../../components/files';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, int, km, money, plate, todayIso } from '../../lib/format';
import { loadSuppliers, loadVehicles } from '../../lib/pickers';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';

export function SalesPage() {
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [status, setStatus] = useState<string>('OPEN');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useApi((signal) => api.get<Paginated<SaleListItem>>('/sales', { status: status === 'OPEN' ? undefined : status, branchId: branchId || undefined, page, pageSize: 25 }, signal), [status, branchId, page]);
  const rows = status === 'OPEN' ? list.data?.items.filter((s) => s.status === 'LISTED' || s.status === 'NEGOTIATING') : list.data?.items;
  const columns: Column<SaleListItem>[] = [
    { key: 'vehicle', header: 'Veículo', render: (s) => <div><span className="nc-plate">{plate(s.vehicle.plate)}</span><div className="xsmall muted">{s.vehicle.model.make.name} {s.vehicle.model.name} · {s.vehicle.yearModel} · {s.vehicle.color}</div></div> },
    { key: 'km', header: 'Km', align: 'right', render: (s) => km(s.vehicle.odometerKm) },
    { key: 'listed', header: 'Anunciado em', render: (s) => date(s.listedAt) },
    { key: 'price', header: 'Preço pretendido', align: 'right', render: (s) => money(s.askingPrice) },
    { key: 'proposals', header: 'Propostas', align: 'right', render: (s) => int(s._count?.proposals ?? 0) },
    { key: 'sold', header: 'Venda', align: 'right', render: (s) => s.salePrice ? <div><div>{money(s.salePrice)}</div><div className="xsmall muted">{date(s.soldAt)}</div></div> : '—' },
    { key: 'status', header: 'Situação', render: (s) => <Status kind="sale" value={s.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Compra e venda" description="Anunciar tira o carro da oferta de locação. A conclusão exige frota livre de contratos, agenda e OS, e preserva todo o histórico."
        actions={can('sales.manage') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Anunciar veículo</Button>} />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[
        { value: 'OPEN', label: 'Em aberto' }, { value: 'SOLD', label: SALE_STATUS_LABEL.SOLD }, { value: 'WITHDRAWN', label: SALE_STATUS_LABEL.WITHDRAWN },
      ]} />
      <Card flush>
        <DataTable columns={columns} rows={rows} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(s) => setOpenId(s.id)}
          empty={{ title: 'Nenhum veículo nesta situação', icon: Tag }}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <ListModal onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); list.reload(); setOpenId(id); }} />}
      {openId && <SaleDrawer id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </Page>
  );
}

function ListModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [vehicleUnitId, setVehicle] = useState<string | null>(null);
  const [appraisal, setAppraisal] = useState<number | ''>('');
  const [asking, setAsking] = useState<number | ''>('');
  const [minimum, setMinimum] = useState<number | ''>('');
  const [channels, setChannels] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Anunciar veículo" description="O veículo passa para À venda e deixa de aparecer para novas locações."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!vehicleUnitId || !asking} onClick={async () => {
        setBusy(true);
        try {
          const res = await api.post<{ id: string }>('/sales', {
            vehicleUnitId, askingPrice: Number(asking), appraisalValue: appraisal === '' ? undefined : appraisal, minimumPrice: minimum === '' ? undefined : minimum,
            adChannels: channels.split(',').map((c) => c.trim()).filter(Boolean), notes: notes || undefined,
          });
          toast.success('Veículo anunciado');
          onSaved(res.id);
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Anunciar</Button></>}>
      <FormGrid>
        <Field label="Veículo" required><EntityPicker value={vehicleUnitId} onChange={(id) => setVehicle(id)} load={loadVehicles()} /></Field>
        <Field label="Avaliação" className="span-4"><MoneyInput value={appraisal} onChange={setAppraisal} /></Field>
        <Field label="Preço pretendido" required className="span-4"><MoneyInput value={asking} onChange={setAsking} /></Field>
        <Field label="Preço mínimo" className="span-4"><MoneyInput value={minimum} onChange={setMinimum} /></Field>
        <Field label="Canais de anúncio" hint="Separe por vírgula."><Input value={channels} onChange={(e) => setChannels(e.target.value)} /></Field>
        <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function SaleDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const [tab, setTab] = useState<'resumo' | 'propostas' | 'despesas' | 'documentos'>('resumo');
  const [modal, setModal] = useState<'proposal' | 'expense' | 'close' | null>(null);
  const sale = useApi((signal) => api.get<SaleDetail>(`/sales/${id}`, undefined, signal), [id]);
  const reload = () => { sale.reload(); onChanged(); };
  const s = sale.data;
  const open = s && (s.status === 'LISTED' || s.status === 'NEGOTIATING');
  return (
    <Drawer open onClose={onClose} wide title={s ? `${plate(s.vehicle.plate)} · ${s.vehicle.model.make.name} ${s.vehicle.model.name}` : 'Venda'} description={s ? SALE_STATUS_LABEL[s.status] : undefined}
      footer={s && open && can('sales.manage') ? <>
        <Button icon={XCircle} onClick={async () => {
          const r = await confirm({ title: 'Retirar da venda', message: 'O veículo volta para a operação de locação.', requireReason: true, confirmLabel: 'Retirar' });
          if (r.confirmed) api.post(`/sales/${id}/withdraw`, { reason: r.reason }).then(() => { toast.success('Retirado da venda'); reload(); }).catch((e) => toast.error(errorMessage(e)));
        }}>Retirar da venda</Button>
        {can('sales.close') && <Button variant="primary" icon={CheckCircle2} onClick={() => setModal('close')}>Concluir venda</Button>}
      </> : undefined}>
      {sale.loading && !s ? <LoadingBlock /> : sale.error || !s ? <ErrorState message={sale.error ?? 'Não encontrado'} onRetry={sale.reload} /> : (
        <div className="stack-lg">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'resumo', label: 'Resumo' }, { value: 'propostas', label: 'Propostas', count: s.proposals.length }, { value: 'despesas', label: 'Preparação', count: s.expenses.length }, { value: 'documentos', label: 'Documentos' }]} />
          {tab === 'resumo' && (
            <>
              {open && (s.checks.canClose
                ? <Alert tone="success" title="Pronto para concluir">Nenhum contrato, compromisso de agenda ou OS em aberto.</Alert>
                : <Alert tone="warning" title="Ainda não é possível concluir">{s.checks.blockers.join(' ')}</Alert>)}
              {open && s.checks.warnings.length > 0 && <Alert tone="info">{s.checks.warnings.join(' ')}</Alert>}
              <KeyValue items={[
                { label: 'Avaliação', value: money(s.appraisalValue) }, { label: 'Preço pretendido', value: money(s.askingPrice) },
                { label: 'Preço mínimo', value: money(s.minimumPrice) }, { label: 'Anunciado em', value: date(s.listedAt) },
                { label: 'Canais', value: s.adChannels.join(', ') || '—' }, { label: 'Quilometragem', value: km(s.vehicle.odometerKm) },
                { label: 'Vendido em', value: date(s.soldAt), hidden: !s.soldAt }, { label: 'Comprador', value: s.buyerName, hidden: !s.buyerName },
                { label: 'Preço de venda', value: money(s.salePrice), hidden: !s.salePrice },
                { label: 'Valor contábil na venda', value: s.bookValueAtSale === null ? 'Não calculado (falta valor de aquisição ou política de depreciação)' : money(s.bookValueAtSale), hidden: s.status !== 'SOLD' },
              ]} />
              {s.notes && <p className="small">{s.notes}</p>}
            </>
          )}
          {tab === 'propostas' && (
            <div className="stack">
              {open && can('sales.manage') && <div><Button icon={Plus} onClick={() => setModal('proposal')}>Registrar proposta</Button></div>}
              <Card flush>
                <DataTable rows={s.proposals} empty={{ title: 'Nenhuma proposta' }} columns={[
                  { key: 'name', header: 'Interessado', render: (p) => <div><div className="strong">{p.name}</div><div className="xsmall muted">{p.contact}</div></div> },
                  { key: 'amount', header: 'Valor', align: 'right', render: (p) => money(p.amount) },
                  { key: 'date', header: 'Data', render: (p) => date(p.createdAt) },
                  { key: 'status', header: 'Situação', render: (p) => <Badge tone={p.status === 'ACCEPTED' ? 'success' : p.status === 'OPEN' ? 'warning' : 'neutral'}>{({ OPEN: 'Em análise', ACCEPTED: 'Aceita', REJECTED: 'Recusada', WITHDRAWN: 'Desistência' })[p.status]}</Badge> },
                  { key: 'actions', header: '', render: (p) => open && p.status === 'OPEN' && can('sales.manage') ? (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" onClick={() => api.post(`/sales/${id}/proposals/${p.id}/status`, { status: 'REJECTED' }).then(reload).catch((e) => toast.error(errorMessage(e)))}>Recusar</Button>
                      <Button size="sm" variant="primary" onClick={() => api.post(`/sales/${id}/proposals/${p.id}/status`, { status: 'ACCEPTED' }).then(reload).catch((e) => toast.error(errorMessage(e)))}>Aceitar</Button>
                    </div>
                  ) : null },
                ]} />
              </Card>
            </div>
          )}
          {tab === 'despesas' && (
            <div className="stack">
              {open && can('finance.payables') && <div><Button icon={ReceiptText} onClick={() => setModal('expense')}>Lançar despesa de preparação</Button></div>}
              <Card flush>
                <DataTable rows={s.expenses} empty={{ title: 'Nenhuma despesa de preparação' }} columns={[
                  { key: 'd', header: 'Descrição', render: (p) => p.description },
                  { key: 'due', header: 'Vencimento', render: (p) => date(p.dueDate) },
                  { key: 'v', header: 'Valor', align: 'right', render: (p) => money(p.amount) },
                  { key: 's', header: 'Situação', render: (p) => <div className="row" style={{ gap: 4 }}><Status kind="title" value={p.status} />{p.approval && <Status kind="approval" value={p.approval} />}</div> },
                ]} />
              </Card>
            </div>
          )}
          {tab === 'documentos' && <Attachments entityType="VehicleSale" entityId={id} canWrite={can('sales.manage')} categories={[{ value: 'laudo', label: 'Laudo / avaliação' }, { value: 'recibo', label: 'Recibo de compra e venda' }, { value: 'transferencia', label: 'Transferência' }, { value: 'outro', label: 'Outro' }]} />}
        </div>
      )}
      {modal === 'proposal' && <ProposalModal saleId={id} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.success('Proposta registrada'); reload(); }} />}
      {modal === 'expense' && <SaleExpenseModal saleId={id} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.success('Despesa lançada — aguarda aprovação'); reload(); }} />}
      {modal === 'close' && s && <CloseModal sale={s} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.success('Venda concluída', 'Veículo baixado da frota; o histórico foi preservado.'); reload(); }} />}
    </Drawer>
  );
}

function ProposalModal({ saleId, onClose, onDone }: { saleId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  return (
    <Modal open onClose={onClose} title="Registrar proposta"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={name.length < 2 || !amount} onClick={() => api.post(`/sales/${saleId}/proposals`, { name, contact: contact || undefined, amount: Number(amount), notes: notes || undefined }).then(onDone).catch((e) => toast.error(errorMessage(e)))}>Registrar</Button></>}>
      <FormGrid>
        <Field label="Interessado" required className="span-6"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Contato" className="span-6"><Input value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
        <Field label="Valor" required className="span-6"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function SaleExpenseModal({ saleId, onClose, onDone }: { saleId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [dueDate, setDue] = useState(todayIso());
  const [supplierId, setSupplier] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Despesa de preparação"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={description.length < 3 || !amount} onClick={() => api.post(`/sales/${saleId}/expenses`, { description, amount: Number(amount), dueDate, supplierId: supplierId ?? undefined }).then(onDone).catch((e) => toast.error(errorMessage(e)))}>Lançar</Button></>}>
      <FormGrid>
        <Field label="Descrição" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: polimento, laudo cautelar" /></Field>
        <Field label="Fornecedor" className="span-6"><EntityPicker value={supplierId} onChange={(id) => setSupplier(id)} load={loadSuppliers()} /></Field>
        <Field label="Valor" required className="span-3"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Vencimento" required className="span-3"><Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function CloseModal({ sale, onClose, onDone }: { sale: SaleDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const accepted = sale.proposals.find((p) => p.status === 'ACCEPTED');
  const [buyerName, setBuyer] = useState(accepted?.name ?? '');
  const [buyerDocument, setDoc] = useState('');
  const [salePrice, setPrice] = useState<number | ''>(accepted?.amount ?? sale.askingPrice);
  const [dueDate, setDue] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const belowMin = sale.minimumPrice !== null && salePrice !== '' && Number(salePrice) < sale.minimumPrice;
  return (
    <Modal open onClose={onClose} title="Concluir venda" description="Gera a conta a receber da venda, marca o veículo como vendido e registra a baixa patrimonial."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!sale.checks.canClose || buyerName.length < 2 || !salePrice} onClick={async () => {
        setBusy(true);
        try { await api.post(`/sales/${sale.id}/close`, { buyerName, buyerDocument: buyerDocument || undefined, salePrice: Number(salePrice), dueDate }); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Concluir venda</Button></>}>
      <div className="stack">
        {!sale.checks.canClose && <Alert tone="danger" title="Pendências impedem a venda">{sale.checks.blockers.join(' ')}</Alert>}
        {sale.checks.warnings.length > 0 && <Alert tone="info">{sale.checks.warnings.join(' ')}</Alert>}
        {belowMin && <Alert tone="warning">Valor abaixo do preço mínimo definido ({money(sale.minimumPrice)}).</Alert>}
        <FormGrid>
          <Field label="Comprador" required className="span-6"><Input value={buyerName} onChange={(e) => setBuyer(e.target.value)} /></Field>
          <Field label="CPF ou CNPJ" className="span-6"><Input value={buyerDocument} onChange={(e) => setDoc(e.target.value)} /></Field>
          <Field label="Preço de venda" required className="span-6"><MoneyInput value={salePrice} onChange={setPrice} /></Field>
          <Field label="Vencimento do recebimento" required className="span-6"><Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
        </FormGrid>
      </div>
    </Modal>
  );
}
