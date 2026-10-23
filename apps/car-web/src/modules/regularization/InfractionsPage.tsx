/* Infrações de trânsito: lista com prazos, cadastro e ficha com histórico, condutor e ações financeiras. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileWarning, Gavel, HandCoins, Plus, ReceiptText, UserCheck } from 'lucide-react';
import {
  INFRACTION_ADMIN_STATUS_LABEL, INFRACTION_FINANCIAL_STATUS_LABEL, type DriverSuggestion, type InfractionDetail, type InfractionListItem,
  type Paginated,
} from '@nortycar/shared';
import { Alert, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Tabs, Timeline } from '../../components/ui';
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Modal } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Status } from '../../components/status';
import { Attachments } from '../../components/files';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, dateTime, money, plate, todayIso } from '../../lib/format';
import { loadContracts, loadCustomers, loadDrivers, loadVehicles } from '../../lib/pickers';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';
import { deadlineBadge } from './deadlines';

export function InfractionsPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [q, setQ] = useState('');
  const [adminStatus, setAdmin] = useState('');
  const [financialStatus, setFinancial] = useState('');
  const [deadline, setDeadline] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const term = useDebounced(q);
  const list = useApi((signal) => api.get<Paginated<InfractionListItem>>('/infractions', {
    q: term, adminStatus, financialStatus, deadlineDays: deadline || undefined, branchId: branchId || undefined, page, pageSize: 25,
  }, signal), [term, adminStatus, financialStatus, deadline, branchId, page]);

  const columns: Column<InfractionListItem>[] = [
    { key: 'auto', header: 'Auto / órgão', render: (i) => <div><div className="strong mono">{i.autoNumber}</div><div className="xsmall muted">{i.authority}</div></div> },
    { key: 'vehicle', header: 'Veículo', render: (i) => <span className="nc-plate">{plate(i.vehicle.plate)}</span> },
    { key: 'occurred', header: 'Ocorrência', render: (i) => <div><div className="small">{dateTime(i.occurredAt)}</div><div className="xsmall muted ellipsis" style={{ maxWidth: 240 }}>{i.description}</div></div> },
    { key: 'driver', header: 'Condutor', render: (i) => i.driver?.name ?? <span className="muted">Não indicado</span> },
    { key: 'deadlines', header: 'Prazos', render: (i) => <div className="stack-sm" style={{ gap: 4 }}>
      {['RECEIVED', 'UNDER_REVIEW', 'AWAITING_DRIVER_ID'].includes(i.adminStatus) && deadlineBadge('Indicação', i.driverIndicationDeadline)}
      {['PENDING', 'BILLING'].includes(i.financialStatus) && deadlineBadge('Vencimento', i.dueDate)}
    </div> },
    { key: 'amount', header: 'Valor', align: 'right', render: (i) => money(i.finalAmount) },
    { key: 'status', header: 'Situação', render: (i) => <div className="stack-sm" style={{ gap: 4 }}><Status kind="infractionAdmin" value={i.adminStatus} /><Status kind="infractionFinancial" value={i.financialStatus} /></div> },
  ];

  return (
    <Page>
      <PageHeader title="Infrações de trânsito" description="Autos de infração com prazos legais, condutor responsável, defesa e cobrança. Status administrativo e financeiro são separados."
        actions={can('infractions.manage') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Nova infração</Button>} />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={(i) => navigate(`/regularizacao/infracoes/${i.id}`)}
          empty={{ title: 'Nenhuma infração', description: 'Cadastre os autos de infração assim que a notificação chegar, para não perder os prazos.', icon: FileWarning }}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Auto, órgão, placa ou descrição" />
            <div className="nc-filters">
              <select className="nc-select" value={adminStatus} onChange={(e) => { setAdmin(e.target.value); setPage(1); }} aria-label="Status administrativo">
                <option value="">Status administrativo</option>
                {Object.entries(INFRACTION_ADMIN_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="nc-select" value={financialStatus} onChange={(e) => { setFinancial(e.target.value); setPage(1); }} aria-label="Status financeiro">
                <option value="">Status financeiro</option>
                {Object.entries(INFRACTION_FINANCIAL_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="nc-select" value={deadline} onChange={(e) => { setDeadline(e.target.value); setPage(1); }} aria-label="Prazo">
                <option value="">Qualquer prazo</option>
                <option value="7">Prazo em até 7 dias</option>
                <option value="15">Prazo em até 15 dias</option>
                <option value="30">Prazo em até 30 dias</option>
              </select>
            </div>
          </>}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <InfractionForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/regularizacao/infracoes/${id}`)} />}
    </Page>
  );
}

function InfractionForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    autoNumber: '', authority: '', infractionCode: '', description: '', occurredAt: '', location: '', notifiedAt: '',
    driverIndicationDeadline: '', defenseDeadline: '', dueDate: '', points: '',
  });
  const [vehicleUnitId, setVehicle] = useState<string | null>(null);
  const [original, setOriginal] = useState<number | ''>('');
  const [discount, setDiscount] = useState<number | ''>('');
  const [interest, setInterest] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const finalValue = (Number(original) || 0) - (Number(discount) || 0) + (Number(interest) || 0);
  const valid = f.autoNumber && f.authority && f.description.length >= 3 && f.occurredAt && vehicleUnitId && Number(original) > 0 && finalValue > 0;
  const save = async () => {
    setBusy(true);
    try {
      const opt = (v: string) => v || undefined;
      const res = await api.post<{ id: string }>('/infractions', {
        autoNumber: f.autoNumber, authority: f.authority, infractionCode: opt(f.infractionCode), description: f.description,
        occurredAt: new Date(`${f.occurredAt}:00-03:00`).toISOString(), location: opt(f.location), vehicleUnitId,
        notifiedAt: opt(f.notifiedAt), driverIndicationDeadline: opt(f.driverIndicationDeadline), defenseDeadline: opt(f.defenseDeadline),
        dueDate: opt(f.dueDate), points: f.points ? Number(f.points) : undefined, originalAmount: Number(original),
        discountAmount: discount === '' ? undefined : Number(discount), interestAmount: interest === '' ? undefined : Number(interest),
      });
      toast.success('Infração cadastrada');
      onSaved(res.id);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Nova infração" description="Dados do auto de infração. O condutor é indicado depois, com conferência."
      footer={<><span className="grow small muted">Valor final: <span className="strong tnum">{money(finalValue)}</span></span><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={save}>Cadastrar</Button></>}>
      <FormGrid>
        <Field label="Número do auto" required className="span-4"><Input value={f.autoNumber} onChange={set('autoNumber')} /></Field>
        <Field label="Órgão autuador" required className="span-4"><Input value={f.authority} onChange={set('authority')} placeholder="Ex.: DETRAN-MG" /></Field>
        <Field label="Código da infração" className="span-4"><Input value={f.infractionCode} onChange={set('infractionCode')} /></Field>
        <Field label="Veículo" required className="span-6"><EntityPicker value={vehicleUnitId} onChange={(id) => setVehicle(id)} load={loadVehicles({ includeSold: 'true' })} placeholder="Placa ou modelo" /></Field>
        <Field label="Data e hora" required className="span-6"><Input type="datetime-local" value={f.occurredAt} onChange={set('occurredAt')} /></Field>
        <Field label="Descrição" required><Textarea value={f.description} onChange={set('description')} rows={2} /></Field>
        <Field label="Local"><Input value={f.location} onChange={set('location')} /></Field>
        <Field label="Notificada em" className="span-3"><Input type="date" value={f.notifiedAt} onChange={set('notifiedAt')} /></Field>
        <Field label="Prazo de indicação" className="span-3"><Input type="date" value={f.driverIndicationDeadline} onChange={set('driverIndicationDeadline')} /></Field>
        <Field label="Prazo de defesa" className="span-3"><Input type="date" value={f.defenseDeadline} onChange={set('defenseDeadline')} /></Field>
        <Field label="Vencimento" className="span-3"><Input type="date" value={f.dueDate} onChange={set('dueDate')} /></Field>
        <Field label="Valor original" required className="span-3"><MoneyInput value={original} onChange={setOriginal} /></Field>
        <Field label="Desconto" className="span-3"><MoneyInput value={discount} onChange={setDiscount} /></Field>
        <Field label="Juros" className="span-3"><MoneyInput value={interest} onChange={setInterest} /></Field>
        <Field label="Pontos" className="span-3"><Input type="number" min={0} max={30} value={f.points} onChange={set('points')} /></Field>
      </FormGrid>
    </Modal>
  );
}

const FIELD_LABEL: Record<string, string> = {
  created: 'Cadastro', adminStatus: 'Status administrativo', financialStatus: 'Status financeiro', driverId: 'Condutor', appealProtocol: 'Protocolo',
  originalAmount: 'Valor original', discountAmount: 'Desconto', interestAmount: 'Juros', finalAmount: 'Valor final', dueDate: 'Vencimento',
  driverIndicationDeadline: 'Prazo de indicação', defenseDeadline: 'Prazo de defesa', description: 'Descrição', occurredAt: 'Data da infração',
  autoNumber: 'Número do auto', authority: 'Órgão', notes: 'Observações', location: 'Local', notifiedAt: 'Notificação', points: 'Pontos', infractionCode: 'Código',
};

function eventValue(field: string, value: string | null): string {
  if (value === null) return '—';
  if (field === 'adminStatus') return INFRACTION_ADMIN_STATUS_LABEL[value as keyof typeof INFRACTION_ADMIN_STATUS_LABEL] ?? value;
  if (field === 'financialStatus') return INFRACTION_FINANCIAL_STATUS_LABEL[value as keyof typeof INFRACTION_FINANCIAL_STATUS_LABEL] ?? value;
  if (/Amount$/.test(field)) return money(Number(value));
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return field === 'occurredAt' ? dateTime(value) : date(value);
  if (field === 'driverId') return 'alterado';
  return value;
}

type Action = 'status' | 'indicate' | 'pay' | 'charge' | 'appeal' | 'result' | null;

export function InfractionDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { can } = useSession();
  const [tab, setTab] = useState<'resumo' | 'historico' | 'documentos'>('resumo');
  const [action, setAction] = useState<Action>(null);
  const item = useApi((signal) => api.get<InfractionDetail>(`/infractions/${id}`, undefined, signal), [id]);
  const suggestion = useApi((signal) => api.get<DriverSuggestion>(`/infractions/${id}/driver-suggestion`, undefined, signal), [id]);
  if (item.loading && !item.data) return <LoadingBlock />;
  if (item.error || !item.data) return <ErrorState message={item.error ?? 'Não encontrada'} onRetry={item.reload} />;
  const i = item.data;
  const open = !['CANCELLED', 'FINISHED'].includes(i.adminStatus);
  const canIndicate = can('infractions.indicate_driver') && ['RECEIVED', 'UNDER_REVIEW', 'AWAITING_DRIVER_ID'].includes(i.adminStatus);
  const done = (msg: string) => { toast.success(msg); setAction(null); item.reload(); };

  return (
    <Page>
      <PageHeader breadcrumb={<Link to="/regularizacao/infracoes" className="row" style={{ gap: 4 }}><ArrowLeft size={14} aria-hidden />Infrações</Link>}
        title={<span className="row">Auto {i.autoNumber} <Status kind="infractionAdmin" value={i.adminStatus} /><Status kind="infractionFinancial" value={i.financialStatus} /></span>}
        description={`${i.authority} · ${i.description}`}
        actions={open && can('infractions.manage') && <>
          <Button onClick={() => setAction('status')}>Alterar status</Button>
          {canIndicate && <Button icon={UserCheck} onClick={() => setAction('indicate')}>Indicar condutor</Button>}
          {['RECEIVED', 'UNDER_REVIEW', 'DRIVER_INDICATED', 'DENIED'].includes(i.adminStatus) && <Button icon={Gavel} onClick={() => setAction('appeal')}>Registrar defesa/recurso</Button>}
          {i.adminStatus === 'APPEALING' && <Button icon={Gavel} onClick={() => setAction('result')}>Registrar resultado</Button>}
          {!i.payableId && ['PENDING', 'BILLING'].includes(i.financialStatus) && can('finance.payables') && <Button icon={HandCoins} onClick={() => setAction('pay')}>Locadora paga</Button>}
          {!i.receivableId && ['PENDING', 'PAID_BY_COMPANY'].includes(i.financialStatus) && can('finance.receivables') && <Button icon={ReceiptText} onClick={() => setAction('charge')}>Cobrar do cliente</Button>}
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'resumo', label: 'Resumo' }, { value: 'historico', label: 'Histórico', count: i.events.length }, { value: 'documentos', label: 'Documentos' }]} />
      {tab === 'resumo' && (
        <div className="stack-lg">
          <div className="row" style={{ gap: 8 }}>
            {open && deadlineBadge('Indicação de condutor', i.driverIndicationDeadline)}
            {open && deadlineBadge('Defesa', i.defenseDeadline)}
            {['PENDING', 'BILLING'].includes(i.financialStatus) && deadlineBadge('Vencimento', i.dueDate)}
          </div>
          <Card title="Dados do auto">
            <KeyValue items={[
              { label: 'Veículo', value: <Link to={`/frota/veiculos/${i.vehicle.id}`}><span className="nc-plate">{plate(i.vehicle.plate)}</span></Link> },
              { label: 'Modelo', value: `${i.vehicle.model.make.name} ${i.vehicle.model.name}` },
              { label: 'Data e hora', value: dateTime(i.occurredAt) },
              { label: 'Local', value: i.location },
              { label: 'Código', value: i.infractionCode },
              { label: 'Pontos', value: i.points },
              { label: 'Notificada em', value: date(i.notifiedAt) },
              { label: 'Protocolo de recurso', value: i.appealProtocol },
              { label: 'Resultado', value: i.result },
            ]} />
          </Card>
          <div className="grid-2">
            <Card title="Valores">
              <KeyValue items={[
                { label: 'Original', value: money(i.originalAmount) }, { label: 'Desconto', value: money(i.discountAmount) },
                { label: 'Juros', value: money(i.interestAmount) }, { label: 'Valor final', value: <span className="strong">{money(i.finalAmount)}</span> },
                { label: 'Vencimento', value: date(i.dueDate) },
                { label: 'Conta a pagar', value: i.payableId ? <Link to="/financeiro/pagar">Gerada</Link> : '—' },
                { label: 'Cobrança do cliente', value: i.receivableId ? <Link to="/financeiro/receber">Gerada</Link> : '—' },
              ]} />
            </Card>
            <Card title="Condutor">
              <div className="stack">
                <KeyValue items={[
                  { label: 'Condutor indicado', value: i.driver?.name ?? 'Não indicado' },
                  { label: 'Contrato', value: i.contract ? <Link to={`/locacoes/contratos/${i.contract.id}`}>{i.contract.number}</Link> : '—' },
                  { label: 'Cliente responsável', value: i.customer?.name },
                  { label: 'Indicado em', value: dateTime(i.driverIndicatedAt) },
                ]} />
                {!i.driverId && suggestion.data && (
                  <Alert tone={suggestion.data.found ? 'info' : 'neutral'} title={suggestion.data.found ? `Sugestão: ${suggestion.data.driver?.name}` : 'Sem sugestão automática'}>
                    {suggestion.data.found && suggestion.data.contract ? <>Contrato <Link to={`/locacoes/contratos/${suggestion.data.contract.id}`}>{suggestion.data.contract.number}</Link> de {suggestion.data.contract.customer.name}. </> : null}
                    {suggestion.data.reason}
                  </Alert>
                )}
              </div>
            </Card>
          </div>
          {i.notes && <Card title="Observações"><p>{i.notes}</p></Card>}
        </div>
      )}
      {tab === 'historico' && (
        <Card>
          <Timeline items={i.events.map((e) => ({
            id: e.id, title: FIELD_LABEL[e.field] ?? e.field,
            meta: dateTime(e.at),
            description: <>{e.field !== 'created' && <>{eventValue(e.field, e.fromValue)} → <span className="strong">{eventValue(e.field, e.toValue)}</span>{e.note ? ' · ' : ''}</>}{e.note}</>,
          }))} />
        </Card>
      )}
      {tab === 'documentos' && <Card><Attachments entityType="TrafficInfraction" entityId={i.id} canWrite={can('infractions.manage')}
        categories={[{ value: 'notificacao', label: 'Notificação de autuação' }, { value: 'penalidade', label: 'Notificação de penalidade' }, { value: 'comprovante', label: 'Comprovante de pagamento' }, { value: 'recurso', label: 'Defesa / recurso' }, { value: 'indicacao', label: 'Indicação de condutor' }, { value: 'outro', label: 'Outro' }]} /></Card>}

      {action === 'status' && <StatusModal item={i} onClose={() => setAction(null)} onDone={() => done('Status atualizado')} />}
      {action === 'indicate' && <IndicateModal item={i} suggestion={suggestion.data} onClose={() => setAction(null)} onDone={() => done('Condutor indicado')} />}
      {action === 'pay' && <DueDateModal title="Locadora paga a multa" description="Gera uma conta a pagar do tipo multa, que ainda passa pela aprovação do financeiro." path={`/infractions/${i.id}/pay`} onClose={() => setAction(null)} onDone={() => done('Conta a pagar gerada')} />}
      {action === 'charge' && <ChargeModal item={i} onClose={() => setAction(null)} onDone={() => done('Cobrança gerada')} />}
      {action === 'appeal' && <AppealModal id={i.id} onClose={() => setAction(null)} onDone={() => done('Defesa/recurso registrado')} />}
      {action === 'result' && <ResultModal id={i.id} onClose={() => setAction(null)} onDone={() => done('Resultado registrado')} />}
    </Page>
  );
}

function StatusModal({ item, onClose, onDone }: { item: InfractionDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [adminStatus, setAdmin] = useState('');
  const [financialStatus, setFinancial] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const adminOptions = Object.entries(INFRACTION_ADMIN_STATUS_LABEL).filter(([k]) => k !== item.adminStatus && k !== 'DRIVER_INDICATED').map(([value, label]) => ({ value, label }));
  const finOptions = Object.entries(INFRACTION_FINANCIAL_STATUS_LABEL).filter(([k]) => ['REIMBURSED', 'CANCELLED'].includes(k) && k !== item.financialStatus).map(([value, label]) => ({ value, label }));
  return (
    <Modal open onClose={onClose} title="Alterar status" description="Transições inválidas são recusadas pelo servidor. A observação fica no histórico."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={(!adminStatus && !financialStatus) || note.length < 3} onClick={async () => {
        setBusy(true);
        try { await api.post(`/infractions/${item.id}/status`, { adminStatus: adminStatus || undefined, financialStatus: financialStatus || undefined, note }); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Salvar</Button></>}>
      <div className="stack">
        <Field label="Status administrativo"><Select value={adminStatus} onChange={(e) => setAdmin(e.target.value)} placeholder="Manter" options={adminOptions} /></Field>
        <Field label="Status financeiro" hint="Pagamento pela locadora e cobrança do cliente têm ações próprias, que geram os lançamentos."><Select value={financialStatus} onChange={(e) => setFinancial(e.target.value)} placeholder="Manter" options={finOptions} /></Field>
        <Field label="Observação" required><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function IndicateModal({ item, suggestion, onClose, onDone }: { item: InfractionDetail; suggestion?: DriverSuggestion; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [driverId, setDriver] = useState<string | null>(suggestion?.driver?.id ?? null);
  const [contractId, setContract] = useState<string | null>(suggestion?.contract?.id ?? null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Indicar condutor" description="Confirme os dados antes: a indicação ao órgão é responsabilidade de quem a registra e fica na auditoria."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!driverId} onClick={async () => {
        setBusy(true);
        try { await api.post(`/infractions/${item.id}/indicate-driver`, { driverId, contractId: contractId ?? undefined, note: note || undefined }); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Indicar</Button></>}>
      <div className="stack">
        {suggestion?.found && <Alert tone="info">Pré-preenchido com o motorista do contrato vigente em {dateTime(item.occurredAt)}. Altere se a conferência mostrar outro condutor.</Alert>}
        <Field label="Motorista" required><EntityPicker value={driverId} onChange={(id) => setDriver(id)} load={loadDrivers()} initialLabel={suggestion?.driver?.name} /></Field>
        <Field label="Contrato"><EntityPicker value={contractId} onChange={(id) => setContract(id)} load={loadContracts({ vehicleUnitId: item.vehicleUnitId })} initialLabel={suggestion?.contract?.number} /></Field>
        <Field label="Observação"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function DueDateModal({ title, description, path, onClose, onDone }: { title: string; description: string; path: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [dueDate, setDue] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={title} description={description}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!dueDate} onClick={async () => {
        setBusy(true);
        try { await api.post(path, { dueDate }); onDone(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Confirmar</Button></>}>
      <Field label="Vencimento" required><Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
    </Modal>
  );
}

function ChargeModal({ item, onClose, onDone }: { item: InfractionDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [customerId, setCustomer] = useState<string | null>(item.customer?.id ?? null);
  const [dueDate, setDue] = useState(todayIso());
  const [amount, setAmount] = useState<number | ''>(item.finalAmount);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Cobrar do cliente" description="Gera uma conta a receber de reembolso de multa para o cliente responsável."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!dueDate || !amount || (!customerId && !item.contract)} onClick={async () => {
        setBusy(true);
        try { await api.post(`/infractions/${item.id}/charge`, { customerId: customerId ?? undefined, dueDate, amount: Number(amount) }); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Gerar cobrança</Button></>}>
      <div className="stack">
        <Field label="Cliente" hint={item.contract ? 'Vazio = cliente do contrato indicado.' : undefined}><EntityPicker value={customerId} onChange={(id) => setCustomer(id)} load={loadCustomers()} initialLabel={item.customer?.name} /></Field>
        <div className="grid-2">
          <Field label="Valor" required><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Vencimento" required><Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function AppealModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [protocol, setProtocol] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title="Defesa ou recurso"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={protocol.length < 2} onClick={() => api.post(`/infractions/${id}/appeal`, { protocol, note: note || undefined }).then(onDone).catch((e) => toast.error(errorMessage(e)))}>Registrar</Button></>}>
      <div className="stack">
        <Field label="Protocolo" required><Input value={protocol} onChange={(e) => setProtocol(e.target.value)} /></Field>
        <Field label="Observação"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ResultModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [result, setResult] = useState<'GRANTED' | 'DENIED'>('GRANTED');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title="Resultado do recurso"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={note.length < 3} onClick={() => api.post(`/infractions/${id}/appeal-result`, { result, note }).then(onDone).catch((e) => toast.error(errorMessage(e)))}>Registrar</Button></>}>
      <div className="stack">
        <Field label="Resultado" required><Select value={result} onChange={(e) => setResult(e.target.value as 'GRANTED' | 'DENIED')} options={[{ value: 'GRANTED', label: 'Deferido' }, { value: 'DENIED', label: 'Indeferido' }]} /></Field>
        <Field label="Fundamento / observação" required><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

