/* Sinistros: abertura com bloqueio do veículo, acompanhamento, OS, despesas e indenização. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, HandCoins, Plus, ReceiptText, ShieldAlert, Wrench } from 'lucide-react';
import { CLAIM_STATUS_LABEL, CLAIM_TYPE_LABEL, PAYABLE_KIND_LABEL, type ClaimDetail, type ClaimListItem, type Paginated, type PolicyItem } from '@nortycar/shared';
import { Alert, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Tabs, Timeline } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Modal } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Status } from '../../components/status';
import { Attachments } from '../../components/files';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, dateTime, money, plate, todayIso } from '../../lib/format';
import { loadContracts, loadDrivers, loadSuppliers, loadVehicles } from '../../lib/pickers';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';

const TRANSITIONS: Record<string, string[]> = {
  OPEN: ['INSURER_NOTIFIED', 'UNDER_REVIEW', 'REPAIRING', 'CLOSED'],
  INSURER_NOTIFIED: ['UNDER_REVIEW', 'REPAIRING', 'INDEMNIFIED', 'DENIED', 'CLOSED'],
  UNDER_REVIEW: ['REPAIRING', 'INDEMNIFIED', 'DENIED', 'CLOSED'],
  REPAIRING: ['INDEMNIFIED', 'CLOSED'],
  INDEMNIFIED: ['CLOSED'],
  DENIED: ['REPAIRING', 'CLOSED'],
  CLOSED: [],
};

export function ClaimsPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const term = useDebounced(q);
  const list = useApi((signal) => api.get<Paginated<ClaimListItem>>('/claims', { q: term, status, branchId: branchId || undefined, page, pageSize: 25 }, signal), [term, status, branchId, page]);
  const columns: Column<ClaimListItem>[] = [
    { key: 'number', header: 'Sinistro', render: (c) => <span className="strong mono">{c.number}</span> },
    { key: 'type', header: 'Tipo', render: (c) => CLAIM_TYPE_LABEL[c.type] },
    { key: 'vehicle', header: 'Veículo', render: (c) => <span className="nc-plate">{plate(c.vehicle.plate)}</span> },
    { key: 'occurred', header: 'Ocorrência', render: (c) => <div><div className="small">{dateTime(c.occurredAt)}</div><div className="xsmall muted ellipsis" style={{ maxWidth: 260 }}>{c.description}</div></div> },
    { key: 'policy', header: 'Apólice', render: (c) => c.policy?.policyNumber ?? <span className="muted">—</span> },
    { key: 'cost', header: 'Custo estimado', align: 'right', render: (c) => money(c.estimatedCost) },
    { key: 'status', header: 'Situação', render: (c) => <Status kind="claim" value={c.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Sinistros" description="Acidentes, danos, roubos e furtos: seguradora, boletim, orçamentos, reparo e indenização, com o veículo bloqueado quando preciso."
        actions={can('claims.manage') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Registrar sinistro</Button>} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={(c) => navigate(`/regularizacao/sinistros/${c.id}`)}
          empty={{ title: 'Nenhum sinistro registrado', icon: ShieldAlert }}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Número, placa ou descrição" />
            <select className="nc-select" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Situação">
              <option value="">Todas as situações</option>
              {Object.entries(CLAIM_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </>}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <ClaimForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/regularizacao/sinistros/${id}`)} />}
    </Page>
  );
}

function ClaimForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const policies = useApi((signal) => api.get<PolicyItem[]>('/insurance/policies', undefined, signal), []);
  const [vehicleUnitId, setVehicle] = useState<string | null>(null);
  const [contractId, setContract] = useState<string | null>(null);
  const [driverId, setDriver] = useState<string | null>(null);
  const [f, setF] = useState({ type: 'COLLISION', occurredAt: '', location: '', description: '', policyId: '', insurerClaimNumber: '', policeReportNumber: '' });
  const [deductible, setDeductible] = useState<number | ''>('');
  const [estimated, setEstimated] = useState<number | ''>('');
  const [blocks, setBlocks] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const opt = (v: string) => v || undefined;
      const res = await api.post<{ id: string }>('/claims', {
        vehicleUnitId, contractId: contractId ?? undefined, driverId: driverId ?? undefined, type: f.type,
        occurredAt: new Date(`${f.occurredAt}:00-03:00`).toISOString(), location: opt(f.location), description: f.description,
        policyId: opt(f.policyId), insurerClaimNumber: opt(f.insurerClaimNumber), policeReportNumber: opt(f.policeReportNumber),
        deductibleAmount: deductible === '' ? undefined : deductible, estimatedCost: estimated === '' ? undefined : estimated, blocksVehicle: blocks,
      });
      toast.success('Sinistro registrado', blocks ? 'O veículo foi bloqueado para novas locações.' : undefined);
      onSaved(res.id);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Registrar sinistro"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!vehicleUnitId || !f.occurredAt || f.description.length < 3} onClick={save}>Registrar</Button></>}>
      <FormGrid>
        <Field label="Veículo" required className="span-6"><EntityPicker value={vehicleUnitId} onChange={(id) => setVehicle(id)} load={loadVehicles()} /></Field>
        <Field label="Tipo" required className="span-3"><Select value={f.type} onChange={set('type')} options={Object.entries(CLAIM_TYPE_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Data e hora" required className="span-3"><Input type="datetime-local" value={f.occurredAt} onChange={set('occurredAt')} /></Field>
        <Field label="Contrato" className="span-6"><EntityPicker value={contractId} onChange={(id) => setContract(id)} load={loadContracts(vehicleUnitId ? { vehicleUnitId } : {})} /></Field>
        <Field label="Condutor" className="span-6"><EntityPicker value={driverId} onChange={(id) => setDriver(id)} load={loadDrivers()} /></Field>
        <Field label="Descrição do ocorrido" required><Textarea value={f.description} onChange={set('description')} rows={3} /></Field>
        <Field label="Local" className="span-6"><Input value={f.location} onChange={set('location')} /></Field>
        <Field label="Apólice" className="span-6" hint="Vazio usa a apólice vinculada ao veículo."><Select value={f.policyId} onChange={set('policyId')} placeholder="Apólice do veículo" options={(policies.data ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.policyNumber} — ${p.insurer.name}` }))} /></Field>
        <Field label="Nº do sinistro na seguradora" className="span-4"><Input value={f.insurerClaimNumber} onChange={set('insurerClaimNumber')} /></Field>
        <Field label="Boletim de ocorrência" className="span-4"><Input value={f.policeReportNumber} onChange={set('policeReportNumber')} /></Field>
        <Field label="Franquia" className="span-4"><MoneyInput value={deductible} onChange={setDeductible} /></Field>
        <Field label="Custo estimado" className="span-4"><MoneyInput value={estimated} onChange={setEstimated} /></Field>
        <div className="span-8" style={{ alignSelf: 'center' }}><Checkbox label="Bloquear o veículo para novas locações" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} /></div>
      </FormGrid>
    </Modal>
  );
}

export function ClaimDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useSession();
  const [tab, setTab] = useState<'resumo' | 'historico' | 'financeiro' | 'documentos'>('resumo');
  const [modal, setModal] = useState<'status' | 'expense' | 'indemnity' | 'block' | 'note' | null>(null);
  const claim = useApi((signal) => api.get<ClaimDetail>(`/claims/${id}`, undefined, signal), [id]);
  if (claim.loading && !claim.data) return <LoadingBlock />;
  if (claim.error || !claim.data) return <ErrorState message={claim.error ?? 'Não encontrado'} onRetry={claim.reload} />;
  const c = claim.data;
  const open = c.status !== 'CLOSED';
  const done = (msg: string) => { toast.success(msg); setModal(null); claim.reload(); };
  return (
    <Page>
      <PageHeader breadcrumb={<Link to="/regularizacao/sinistros" className="row" style={{ gap: 4 }}><ArrowLeft size={14} aria-hidden />Sinistros</Link>}
        title={<span className="row">{c.number} <Status kind="claim" value={c.status} /></span>} description={`${CLAIM_TYPE_LABEL[c.type]} · ${c.description}`}
        actions={open && can('claims.manage') && <>
          <Button onClick={() => setModal('status')}>Alterar situação</Button>
          <Button onClick={() => setModal('note')}>Anotar</Button>
          {c.vehicle.operationalStatus !== 'BLOCKED' && can('fleet.status') && <Button icon={Ban} onClick={() => setModal('block')}>Bloquear veículo</Button>}
          {!c.workOrderId && can('maintenance.manage') && <Button icon={Wrench} onClick={() => navigate(`/operacao/ordens-servico?novo=1&vehicleUnitId=${c.vehicleUnitId}&claimId=${c.id}&description=${encodeURIComponent(`Reparo do sinistro ${c.number}: ${c.description}`)}`)}>Gerar OS</Button>}
          {can('finance.payables') && <Button icon={ReceiptText} onClick={() => setModal('expense')}>Lançar despesa</Button>}
          {can('finance.receivables') && <Button icon={HandCoins} onClick={() => setModal('indemnity')}>Registrar indenização</Button>}
        </>} />
      {c.vehicle.operationalStatus === 'BLOCKED' && <Alert tone="warning" title="Veículo bloqueado">Para liberar, use a ficha do veículo — exige a permissão de liberar veículo bloqueado.</Alert>}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'resumo', label: 'Resumo' }, { value: 'historico', label: 'Histórico', count: c.events.length }, { value: 'financeiro', label: 'Despesas e indenização', count: c.payables.length + c.indemnities.length }, { value: 'documentos', label: 'Documentos' }]} />
      {tab === 'resumo' && (
        <div className="grid-2">
          <Card title="Ocorrência">
            <KeyValue items={[
              { label: 'Veículo', value: <Link to={`/frota/veiculos/${c.vehicle.id}`}><span className="nc-plate">{plate(c.vehicle.plate)}</span></Link> },
              { label: 'Modelo', value: `${c.vehicle.model.make.name} ${c.vehicle.model.name}` },
              { label: 'Data e hora', value: dateTime(c.occurredAt) }, { label: 'Local', value: c.location },
              { label: 'Contrato', value: c.contract ? <Link to={`/locacoes/contratos/${c.contract.id}`}>{c.contract.number} · {c.contract.customer.name}</Link> : '—' },
              { label: 'Condutor', value: c.driver?.name }, { label: 'Boletim de ocorrência', value: c.policeReportNumber },
              { label: 'Ordem de serviço', value: c.workOrder ? <Link to={`/operacao/ordens-servico/${c.workOrder.id}`}>{c.workOrder.number}</Link> : '—' },
            ]} />
          </Card>
          <Card title="Seguro e valores">
            <KeyValue items={[
              { label: 'Seguradora', value: c.policy?.insurer.name }, { label: 'Apólice', value: c.policy?.policyNumber },
              { label: 'Nº na seguradora', value: c.insurerClaimNumber }, { label: 'Franquia', value: money(c.deductibleAmount) },
              { label: 'Custo estimado', value: money(c.estimatedCost) }, { label: 'Indenização', value: money(c.indemnityAmount) },
              { label: 'Encerrado em', value: dateTime(c.closedAt) },
            ]} />
          </Card>
        </div>
      )}
      {tab === 'historico' && <Card><Timeline items={c.events.map((e) => ({ id: e.id, title: e.toStatus ? `${e.fromStatus ? `${CLAIM_STATUS_LABEL[e.fromStatus as keyof typeof CLAIM_STATUS_LABEL]} → ` : ''}${CLAIM_STATUS_LABEL[e.toStatus as keyof typeof CLAIM_STATUS_LABEL]}` : 'Anotação', meta: dateTime(e.at), description: e.note }))} /></Card>}
      {tab === 'financeiro' && (
        <Card flush>
          <DataTable rows={[...c.payables.map((p) => ({ ...p, side: 'Despesa' })), ...c.indemnities.map((r) => ({ ...r, side: 'Indenização' }))]}
            empty={{ title: 'Nenhuma despesa ou indenização lançada' }}
            columns={[
              { key: 'side', header: 'Tipo', render: (r) => r.side },
              { key: 'description', header: 'Descrição', render: (r) => r.description },
              { key: 'due', header: 'Vencimento', render: (r) => date(r.dueDate) },
              { key: 'amount', header: 'Valor', align: 'right', render: (r) => money(r.amount) },
              { key: 'status', header: 'Situação', render: (r) => <div className="row" style={{ gap: 4 }}><Status kind="title" value={r.status} />{r.approval && <Status kind="approval" value={r.approval} />}</div> },
            ]} />
        </Card>
      )}
      {tab === 'documentos' && <Card><Attachments entityType="Claim" entityId={c.id} canWrite={can('claims.manage')} categories={[{ value: 'bo', label: 'Boletim de ocorrência' }, { value: 'fotos', label: 'Fotos' }, { value: 'orcamento', label: 'Orçamento' }, { value: 'seguradora', label: 'Documento da seguradora' }, { value: 'outro', label: 'Outro' }]} /></Card>}

      {modal === 'status' && <ClaimStatusModal claim={c} onClose={() => setModal(null)} onDone={() => done('Situação atualizada')} />}
      {modal === 'note' && <NoteModal title="Anotação" path={`/claims/${c.id}/notes`} onClose={() => setModal(null)} onDone={() => done('Anotação registrada')} />}
      {modal === 'block' && <NoteModal title="Bloquear veículo" path={`/claims/${c.id}/block-vehicle`} label="Motivo do bloqueio" onClose={() => setModal(null)} onDone={() => done('Veículo bloqueado')} />}
      {modal === 'expense' && <ExpenseModal claimId={c.id} onClose={() => setModal(null)} onDone={() => done('Despesa lançada — aguarda aprovação no financeiro')} />}
      {modal === 'indemnity' && <IndemnityModal claimId={c.id} onClose={() => setModal(null)} onDone={() => done('Indenização registrada')} />}
    </Page>
  );
}

function ClaimStatusModal({ claim, onClose, onDone }: { claim: ClaimDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const options = TRANSITIONS[claim.status] ?? [];
  const [status, setStatus] = useState(options[0] ?? '');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title="Alterar situação"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!status || note.length < 3} onClick={() => api.post(`/claims/${claim.id}/status`, { status, note }).then(onDone).catch((e) => toast.error(errorMessage(e)))}>Salvar</Button></>}>
      <div className="stack">
        <Field label="Nova situação" required><Select value={status} onChange={(e) => setStatus(e.target.value)} options={options.map((s) => ({ value: s, label: CLAIM_STATUS_LABEL[s as keyof typeof CLAIM_STATUS_LABEL] }))} /></Field>
        <Field label="Observação" required><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function NoteModal({ title, path, label = 'Texto', onClose, onDone }: { title: string; path: string; label?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={title}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={note.length < 3} onClick={() => api.post(path, { note }).then(onDone).catch((e) => toast.error(errorMessage(e)))}>Salvar</Button></>}>
      <Field label={label} required><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function ExpenseModal({ claimId, onClose, onDone }: { claimId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState('MAINTENANCE');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [dueDate, setDue] = useState(todayIso());
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [documentNumber, setDoc] = useState('');
  return (
    <Modal open onClose={onClose} title="Lançar despesa do sinistro" description="Gera conta a pagar ligada ao sinistro e ao veículo, sujeita à aprovação."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={description.length < 3 || !amount} onClick={() => api.post(`/claims/${claimId}/expenses`, { kind, description, amount: Number(amount), dueDate, supplierId: supplierId ?? undefined, documentNumber: documentNumber || undefined }).then(onDone).catch((e) => toast.error(errorMessage(e)))}>Lançar</Button></>}>
      <FormGrid>
        <Field label="Tipo" required className="span-6"><Select value={kind} onChange={(e) => setKind(e.target.value)} options={['MAINTENANCE', 'PARTS', 'INSURANCE', 'DOCUMENTATION', 'OTHER'].map((k) => ({ value: k, label: PAYABLE_KIND_LABEL[k as keyof typeof PAYABLE_KIND_LABEL] }))} /></Field>
        <Field label="Fornecedor" className="span-6"><EntityPicker value={supplierId} onChange={(id) => setSupplier(id)} load={loadSuppliers()} /></Field>
        <Field label="Descrição" required><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Valor" required className="span-4"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Vencimento" required className="span-4"><Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Nota fiscal" className="span-4"><Input value={documentNumber} onChange={(e) => setDoc(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function IndemnityModal({ claimId, onClose, onDone }: { claimId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState<number | ''>('');
  const [dueDate, setDue] = useState(todayIso());
  const [description, setDescription] = useState('');
  return (
    <Modal open onClose={onClose} title="Registrar indenização" description="Gera uma conta a receber da seguradora."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!amount} onClick={() => api.post(`/claims/${claimId}/indemnity`, { amount: Number(amount), dueDate, description: description || undefined }).then(onDone).catch((e) => toast.error(errorMessage(e)))}>Registrar</Button></>}>
      <div className="stack">
        <div className="grid-2">
          <Field label="Valor" required><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Previsão de recebimento" required><Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        <Field label="Observação"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
