/* Ficha do veículo: dados, situação, agenda, linha do tempo, documentos e patrimônio. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight, Ban, CalendarPlus, CalendarRange, Car, CircleCheck, ClipboardCheck, FileText, FileWarning, Fuel, Gauge, History, Pencil,
  ScrollText, ShieldAlert, Tag, Trash2, Unlock, Wrench, CircleDot, Receipt,
} from 'lucide-react';
import {
  ALLOCATION_KIND_LABEL, COMMERCIAL_STATUS_LABEL, FUEL_TYPE_LABEL, OPERATIONAL_STATUS_LABEL, TRANSMISSION_LABEL,
  type AgendaBlock, type Paginated, type VehicleDetail, type TimelineItem,
} from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Plate, Tabs, Timeline } from '../../components/ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../components/form';
import { Modal, useConfirm } from '../../components/overlay';
import { Status } from '../../components/status';
import { Attachments } from '../../components/files';
import { Pagination } from '../../components/table';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, dateTime, fromLocalInput, km, money, relative, toLocalInput } from '../../lib/format';
import { useSession } from '../../lib/session';
import { VEHICLE_DOC_CATEGORIES } from './shared';
import { VehicleForm } from './VehicleForm';
import './fleet.css';

type Tab = 'overview' | 'agenda' | 'timeline' | 'documents' | 'assets';

export const TIMELINE_ICON: Record<string, LucideIcon> = {
  CREATED: Car, UPDATED: Pencil, STATUS_CHANGED: Tag, RESERVATION: CalendarRange, CONTRACT_STARTED: ScrollText, CONTRACT_ENDED: ScrollText,
  DRIVER_LINKED: ScrollText, DRIVER_CHANGED: ScrollText, ODOMETER: Gauge, INSPECTION: ClipboardCheck, MAINTENANCE: Wrench, PART_USED: Wrench,
  INFRACTION: FileWarning, CLAIM: ShieldAlert, EXPENSE: Receipt, REVENUE: Receipt, REFUEL: Fuel, TIRE: CircleDot, DOCUMENT: FileText,
  SALE: Tag, DISPOSAL: Trash2,
};

export function VehicleDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState<'status' | 'odometer' | 'transfer' | null>(null);
  const v = useApi(() => api.get<VehicleDetail>(`/vehicles/${id}`), [id]);

  if (v.loading && !v.data) return <LoadingBlock />;
  if (v.error || !v.data) return <ErrorState message={v.error ?? 'Veículo não encontrado.'} onRetry={v.reload} />;
  const d = v.data;
  const gone = Boolean(d.deletedAt) || d.commercialStatus === 'SOLD';

  const remove = async () => {
    const r = await confirm({
      title: 'Excluir veículo do cadastro', confirmLabel: 'Excluir', requireReason: true,
      message: 'O veículo sai das listas e da disponibilidade. Contratos, multas, OS e a linha do tempo continuam preservados.',
    });
    if (!r.confirmed) return;
    try {
      await api.del(`/vehicles/${id}`, { reason: r.reason });
      toast.success('Veículo excluído do cadastro');
      navigate('/frota/veiculos');
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <Page>
      <PageHeader
        breadcrumb={<><Link to="/frota/veiculos">Veículos</Link><span>/</span><span>{d.internalCode}</span></>}
        title={<span className="row"><Plate value={d.plate} /> {d.model.make.name} {d.model.name}{d.version ? ` ${d.version.name}` : ''}</span>}
        description={`${d.yearManufacture}/${d.yearModel} · ${d.color} · ${d.branch.name}`}
        actions={!gone && <>
          {can('fleet.status') && <Button icon={Tag} onClick={() => setModal('status')}>Alterar situação</Button>}
          {can('fleet.edit') && <Button icon={Gauge} onClick={() => setModal('odometer')}>Hodômetro</Button>}
          {can('fleet.edit') && <Button icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>}
        </>}
      />
      {d.deletedAt && <Alert tone="neutral" title="Veículo excluído do cadastro">O histórico permanece disponível para consulta.</Alert>}
      {d.operationalStatus === 'BLOCKED' && <Alert tone="danger" title="Veículo bloqueado">{d.blockReason ?? 'Sem motivo registrado.'} Não pode ser locado até ser liberado por quem tem autorização.</Alert>}
      <div className="grid-4">
        <div className="nc-card nc-stat"><span className="nc-stat__label">Comercial</span><div><Status kind="commercial" value={d.commercialStatus} /></div></div>
        <div className="nc-card nc-stat"><span className="nc-stat__label">Operacional</span><div><Status kind="operational" value={d.operationalStatus} /></div></div>
        <div className="nc-card nc-stat"><span className="nc-stat__label">Quilometragem</span><span className="nc-stat__value nc-stat__value--md">{km(d.odometerKm)}</span></div>
        <div className="nc-card nc-stat"><span className="nc-stat__label">Contrato em aberto</span>
          {d.openContract ? <Link to={`/locacoes/contratos/${d.openContract.id}`} className="strong">{d.openContract.number}</Link> : <span className="muted">Nenhum</span>}
        </div>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Visão geral' },
        { value: 'agenda', label: 'Agenda' },
        { value: 'timeline', label: 'Linha do tempo' },
        { value: 'documents', label: 'Documentos' },
        { value: 'assets', label: 'Patrimônio', hidden: !can('fleet.financials') },
      ]} />
      {tab === 'overview' && (
        <div className="stack">
          <Card title="Identificação e especificação">
            <KeyValue items={[
              { label: 'Código interno', value: <span className="mono">{d.internalCode}</span> },
              { label: 'RENAVAM', value: d.renavam },
              { label: 'Chassi', value: d.chassis ? <span className="mono">{d.chassis}</span> : null },
              { label: 'Motor', value: d.engineNumber },
              { label: 'Categoria', value: d.category.name },
              { label: 'Combustível', value: FUEL_TYPE_LABEL[d.fuel] },
              { label: 'Câmbio', value: TRANSMISSION_LABEL[d.transmission] },
              { label: 'Portas', value: d.doors },
              { label: 'Tanque', value: d.tankCapacityLiters ? `${d.tankCapacityLiters} L` : null },
              { label: 'Hodômetro inicial', value: km(d.initialOdometerKm) },
              { label: 'Localização', value: d.location },
              { label: 'No site público', value: d.publicVisible ? 'Sim' : 'Não' },
            ]} />
          </Card>
          <Card title="Documentação" actions={!gone && can('fleet.edit') && <Button size="sm" icon={ArrowLeftRight} onClick={() => setModal('transfer')}>Transferir de filial</Button>}>
            <KeyValue items={[
              { label: 'Filial', value: d.branch.name },
              { label: 'Licenciamento', value: <DueDate value={d.licensingDueDate} /> },
              { label: 'IPVA', value: <DueDate value={d.ipvaDueDate} /> },
              { label: 'Fornecedor', value: d.supplier?.name },
              { label: 'Cadastrado em', value: dateTime(d.createdAt) },
              { label: 'Atualizado', value: relative(d.updatedAt) },
            ]} />
            {d.notes && <p className="small muted" style={{ marginTop: 'var(--space-4)', whiteSpace: 'pre-wrap' }}>{d.notes}</p>}
          </Card>
          <Card title="Atalhos">
            <div className="row">
              <Link className="nc-btn nc-btn--secondary" to={`/locacoes/contratos?vehicleUnitId=${d.id}`}><ScrollText size={16} aria-hidden />Contratos</Link>
              <Link className="nc-btn nc-btn--secondary" to={`/operacao/ordens-servico?vehicleUnitId=${d.id}`}><Wrench size={16} aria-hidden />Ordens de serviço</Link>
              <Link className="nc-btn nc-btn--secondary" to={`/operacao/vistorias?vehicleUnitId=${d.id}`}><ClipboardCheck size={16} aria-hidden />Vistorias</Link>
              <Link className="nc-btn nc-btn--secondary" to={`/regularizacao/infracoes?vehicleUnitId=${d.id}`}><FileWarning size={16} aria-hidden />Infrações</Link>
              <Link className="nc-btn nc-btn--secondary" to={`/operacao/abastecimentos?vehicleUnitId=${d.id}`}><Fuel size={16} aria-hidden />Abastecimentos</Link>
              <Link className="nc-btn nc-btn--secondary" to={`/frota/historico?placa=${d.plate}`}><History size={16} aria-hidden />Histórico completo</Link>
            </div>
          </Card>
          {!gone && can('fleet.delete') && (
            <Card title="Excluir do cadastro" subtitle="Só é possível sem contrato em aberto e sem compromissos ativos na agenda.">
              <Button variant="danger" icon={Trash2} onClick={remove}>Excluir veículo</Button>
            </Card>
          )}
        </div>
      )}
      {tab === 'agenda' && <AgendaTab vehicleId={id} editable={!gone && can('fleet.status')} />}
      {tab === 'timeline' && <TimelineTab vehicleId={id} />}
      {tab === 'documents' && (
        <Card><Attachments entityType="VehicleUnit" entityId={id} canWrite={can('fleet.documents') && !d.deletedAt} categories={VEHICLE_DOC_CATEGORIES} /></Card>
      )}
      {tab === 'assets' && (
        <Card title="Valores patrimoniais" subtitle="A rentabilidade usa o valor de aquisição e a política de depreciação da empresa.">
          <KeyValue items={[
            { label: 'Data de aquisição', value: date(d.acquiredAt) },
            { label: 'Valor de aquisição', value: money(d.acquisitionValue ?? null) },
            { label: 'Valor de mercado', value: money(d.marketValue ?? null) },
            { label: 'Vendido em', value: d.soldAt ? dateTime(d.soldAt) : null, hidden: !d.soldAt },
          ]} />
        </Card>
      )}
      {editing && <VehicleForm vehicle={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); v.reload(); }} />}
      {modal === 'status' && <StatusModal vehicle={d} onClose={() => setModal(null)} onSaved={(nv) => { setModal(null); v.setData(nv); }} />}
      {modal === 'odometer' && <OdometerModal vehicle={d} onClose={() => setModal(null)} onSaved={() => { setModal(null); v.reload(); }} />}
      {modal === 'transfer' && <TransferModal vehicle={d} onClose={() => setModal(null)} onSaved={() => { setModal(null); v.reload(); }} />}
    </Page>
  );
}

function DueDate({ value }: { value: string | null }) {
  if (!value) return <span className="muted">Não informado</span>;
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  return <span className="row" style={{ gap: 6 }}>{date(value)}{days < 0 ? <Badge tone="danger">Vencido</Badge> : days <= 30 ? <Badge tone="warning">{days} dias</Badge> : null}</span>;
}

function StatusModal({ vehicle, onClose, onSaved }: { vehicle: VehicleDetail; onClose: () => void; onSaved: (v: VehicleDetail) => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [field, setField] = useState<'OPERATIONAL' | 'COMMERCIAL'>('OPERATIONAL');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const unblocking = field === 'OPERATIONAL' && vehicle.operationalStatus === 'BLOCKED';
  const needsReason = (field === 'OPERATIONAL' && (to === 'BLOCKED' || unblocking)) || to === 'FOR_SALE';
  const opOptions = Object.entries(OPERATIONAL_STATUS_LABEL).filter(([k]) => k !== vehicle.operationalStatus).map(([value, label]) => ({ value, label }));
  const comOptions = [
    ...(vehicle.commercialStatus !== 'FOR_SALE' ? [{ value: 'FOR_SALE', label: COMMERCIAL_STATUS_LABEL.FOR_SALE }] : []),
    ...(vehicle.commercialStatus === 'FOR_SALE' ? [{ value: 'AVAILABLE', label: 'Retirar da venda' }] : []),
  ];
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api.post<VehicleDetail>(`/vehicles/${vehicle.id}/status`, { field, to, reason: reason.trim() || undefined }));
      toast.success('Situação atualizada');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Alterar situação"
      description="Alugado e Reservado vêm da agenda; Vendido, do fluxo de venda. Toda mudança entra na linha do tempo."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!to || (needsReason && reason.trim().length < 3)} onClick={save}>Salvar</Button></>}>
      <div className="stack">
        <Select value={field} onChange={(e) => { setField(e.target.value as 'OPERATIONAL'); setTo(''); }} aria-label="Tipo de situação"
          options={[{ value: 'OPERATIONAL', label: `Operacional (atual: ${OPERATIONAL_STATUS_LABEL[vehicle.operationalStatus]})` }, { value: 'COMMERCIAL', label: `Comercial (atual: ${COMMERCIAL_STATUS_LABEL[vehicle.commercialStatus]})` }]} />
        {unblocking && !can('fleet.unblock') && <Alert tone="warning">O veículo está bloqueado. Liberar exige a permissão "Liberar veículo bloqueado".</Alert>}
        <Field label="Nova situação" required>
          <Select value={to} onChange={(e) => setTo(e.target.value)} placeholder="Selecione" options={field === 'OPERATIONAL' ? opOptions : comOptions} />
        </Field>
        <Field label="Motivo" required={needsReason} hint="Fica registrado na auditoria e na linha do tempo.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        {to === 'BLOCKED' && <div className="row small muted"><Ban size={14} aria-hidden />O veículo deixa de aparecer na disponibilidade até ser liberado.</div>}
        {unblocking && to && <div className="row small muted"><Unlock size={14} aria-hidden />A liberação fica registrada com seu nome.</div>}
      </div>
    </Modal>
  );
}

function OdometerModal({ vehicle, onClose, onSaved }: { vehicle: VehicleDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(String(vehicle.odometerKm));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const invalid = !value || n < vehicle.odometerKm;
  return (
    <Modal open onClose={onClose} title="Registrar leitura do hodômetro" description={`Atual: ${km(vehicle.odometerKm)}. A quilometragem nunca regride.`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={invalid} onClick={async () => {
        setBusy(true);
        try { await api.post(`/vehicles/${vehicle.id}/odometer`, { km: n, note: note.trim() || undefined }); toast.success('Leitura registrada'); onSaved(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Registrar</Button></>}>
      <div className="stack">
        <Field label="Quilometragem" required error={value && n < vehicle.odometerKm ? 'Menor que a leitura atual.' : null}><Input type="number" min={vehicle.odometerKm} value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></Field>
        <Field label="Observação"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      </div>
    </Modal>
  );
}

function TransferModal({ vehicle, onClose, onSaved }: { vehicle: VehicleDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { session } = useSession();
  const [branchId, setBranchId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const options = (session?.context.branches ?? []).filter((b) => b.id !== vehicle.branchId).map((b) => ({ value: b.id, label: b.name }));
  return (
    <Modal open onClose={onClose} title="Transferir de filial" description={`Hoje em ${vehicle.branch.name}. Não é possível com reserva ou contrato em andamento.`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!branchId || reason.trim().length < 3} onClick={async () => {
        setBusy(true);
        try { await api.post(`/vehicles/${vehicle.id}/transfer`, { branchId, reason }); toast.success('Veículo transferido'); onSaved(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Transferir</Button></>}>
      <div className="stack">
        {!options.length && <Alert tone="info">Você não tem outra filial autorizada para receber o veículo.</Alert>}
        <Field label="Filial de destino" required><Select value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="Selecione" options={options} /></Field>
        <Field label="Motivo" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      </div>
    </Modal>
  );
}

function AgendaTab({ vehicleId, editable }: { vehicleId: string; editable: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const agenda = useApi(() => api.get<AgendaBlock[]>(`/vehicles/${vehicleId}/agenda`, {
    from: new Date(Date.now() - 7 * 86_400_000).toISOString(), to: new Date(Date.now() + 120 * 86_400_000).toISOString(),
  }), [vehicleId]);
  const release = async (b: AgendaBlock) => {
    const r = await confirm({ title: 'Liberar bloqueio', message: 'O período volta a ficar disponível para locação.', requireReason: true, confirmLabel: 'Liberar' });
    if (!r.confirmed) return;
    api.del(`/vehicles/${vehicleId}/blocks/${b.id}`, { reason: r.reason }).then(() => { toast.success('Bloqueio liberado'); agenda.reload(); }).catch((e) => toast.error(errorMessage(e)));
  };
  return (
    <Card title="Compromissos na agenda" subtitle="Últimos 7 dias e próximos 120. O preparo entre locações já está incluído no fim de cada bloco."
      actions={editable && <Button size="sm" icon={CalendarPlus} onClick={() => setCreating(true)}>Bloquear período</Button>} flush>
      {agenda.loading && !agenda.data ? <LoadingBlock /> : agenda.error ? <ErrorState message={agenda.error} onRetry={agenda.reload} /> : !agenda.data?.length ? (
        <EmptyState icon={CircleCheck} title="Agenda livre" description="Nenhuma reserva, contrato, manutenção ou bloqueio no período." />
      ) : (
        <ul className="nc-list">
          {agenda.data.map((b) => (
            <li key={b.id}>
              <span className={`agenda-dot agenda-dot--${b.kind.toLowerCase()}`} aria-hidden />
              <div className="grow">
                <div className="strong">{ALLOCATION_KIND_LABEL[b.kind]}{b.reason ? ` · ${b.reason}` : ''}</div>
                <div className="xsmall muted">{dateTime(b.startsAt)} até {dateTime(b.endsAt)}{b.blockedUntil !== b.endsAt ? ` (preparo até ${dateTime(b.blockedUntil)})` : ''}</div>
              </div>
              {b.reservationId && <Link className="small" to={`/locacoes/reservas/${b.reservationId}`}>Ver reserva</Link>}
              {b.workOrderId && <Link className="small" to={`/operacao/ordens-servico/${b.workOrderId}`}>Ver OS</Link>}
              {b.kind === 'BLOCK' && editable && <Button size="sm" variant="ghost" icon={Unlock} onClick={() => release(b)}>Liberar</Button>}
            </li>
          ))}
        </ul>
      )}
      {creating && <BlockModal vehicleId={vehicleId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); agenda.reload(); }} />}
    </Card>
  );
}

function BlockModal({ vehicleId, onClose, onSaved }: { vehicleId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [start, setStart] = useState(toLocalInput(new Date()));
  const [end, setEnd] = useState(toLocalInput(new Date(Date.now() + 86_400_000)));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const invalid = !start || !end || end <= start || reason.trim().length < 3;
  return (
    <Modal open onClose={onClose} title="Bloquear período na agenda" description="O veículo não pode ser reservado nem locado no período. Conflitos com compromissos existentes são recusados."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={invalid} onClick={async () => {
        setBusy(true);
        try { await api.post(`/vehicles/${vehicleId}/blocks`, { startsAt: fromLocalInput(start), endsAt: fromLocalInput(end), reason }); toast.success('Período bloqueado'); onSaved(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Bloquear</Button></>}>
      <FormGrid>
        <Field label="Início" required className="span-6"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Fim" required className="span-6" error={end && start && end <= start ? 'Precisa ser depois do início.' : null}><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Motivo" required className="span-12"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
      </FormGrid>
    </Modal>
  );
}

export function TimelineTab({ vehicleId }: { vehicleId: string }) {
  const [page, setPage] = useState(1);
  const tl = useApi(() => api.get<Paginated<TimelineItem & { actorName: string | null }>>(`/vehicles/${vehicleId}/timeline`, { page, pageSize: 30 }), [vehicleId, page]);
  return (
    <Card title="Linha do tempo" subtitle="Tudo o que aconteceu com esta placa. O histórico não se apaga quando o contrato termina ou o carro é vendido.">
      {tl.loading && !tl.data ? <LoadingBlock /> : tl.error ? <ErrorState message={tl.error} onRetry={tl.reload} /> : (
        <>
          <Timeline items={(tl.data?.items ?? []).map((i) => ({
            id: i.id, title: i.title, icon: TIMELINE_ICON[i.type] ?? History,
            meta: `${dateTime(i.at)}${i.actorName ? ` · ${i.actorName}` : ''}`, description: i.description,
          }))} />
          {tl.data && tl.data.total > tl.data.pageSize && <Pagination page={tl.data.page} pageSize={tl.data.pageSize} total={tl.data.total} onPage={setPage} />}
        </>
      )}
    </Card>
  );
}
