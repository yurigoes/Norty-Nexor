import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Wrench } from 'lucide-react';
import {
  PRIORITY_LABEL, WORK_ORDER_STATUS_LABEL, type Paginated, type Priority, type WorkOrderRow, type WorkOrderStatus,
} from '@nortycar/shared';
import { Alert, Badge, Button, Card, Page, PageHeader, Plate, Segmented } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Modal } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, fromLocalInput } from '../../lib/format';
import { loadSuppliers, loadVehicles } from '../../lib/pickers';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';
import './operations.css';

const OPEN_COLUMNS: WorkOrderStatus[] = ['OPEN', 'AWAITING_ESTIMATE', 'AWAITING_APPROVAL', 'AWAITING_PARTS', 'IN_PROGRESS'];
const PRIORITY_TONE: Record<Priority, 'neutral' | 'info' | 'warning' | 'danger'> = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'danger' };

export function WorkOrdersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const vehicleUnitId = params.get('vehicleUnitId') ?? '';
  const creating = params.get('novo') === '1';
  const list = useApi(
    () => api.get<Paginated<WorkOrderRow>>('/work-orders', view === 'board'
      ? { open: true, pageSize: 200, branchId, vehicleUnitId, q: term }
      : { status, q: term, page, pageSize: 25, branchId, vehicleUnitId }),
    [view, status, term, page, branchId, vehicleUnitId],
  );

  const columns: Column<WorkOrderRow>[] = [
    { key: 'n', header: 'OS', render: (w) => <div><div className="strong mono">{w.number}</div><div className="xsmall muted">{w.serviceType.name}</div></div> },
    { key: 'v', header: 'Veículo', render: (w) => <div className="stack-sm" style={{ gap: 2 }}><Plate value={w.vehicle.plate} /><span className="xsmall muted">{w.vehicle.model.make.name} {w.vehicle.model.name}</span></div> },
    { key: 'd', header: 'Descrição', render: (w) => <span className="small ellipsis" style={{ maxWidth: 280, display: 'inline-block' }}>{w.description}</span> },
    { key: 'p', header: 'Prioridade', render: (w) => <Badge tone={PRIORITY_TONE[w.priority]}>{PRIORITY_LABEL[w.priority]}</Badge> },
    { key: 'due', header: 'Prazo', render: (w) => <span className={w.overdue ? 'text-danger strong' : 'small'}>{date(w.dueAt)}{w.overdue ? ' · atrasada' : ''}</span> },
    { key: 's', header: 'Situação', render: (w) => <Status kind="workOrder" value={w.status} /> },
  ];

  return (
    <Page>
      <PageHeader title="Ordens de serviço" description="Manutenção preventiva e corretiva, com orçamento, aprovação, peças do estoque e liberação do veículo."
        actions={<>
          <Segmented label="Visualização" value={view} onChange={setView} options={[{ value: 'list', label: 'Lista' }, { value: 'board', label: 'Quadro' }]} />
          {can('maintenance.manage') && <Button variant="primary" icon={Plus} onClick={() => setParams({ novo: '1' })}>Nova OS</Button>}
        </>} />
      {vehicleUnitId && <Alert tone="info" action={<Button size="sm" onClick={() => setParams({})}>Ver todas</Button>}>Exibindo as ordens de um veículo.</Alert>}
      {view === 'list' ? (
        <Card flush>
          <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(w) => navigate(`/operacao/ordens-servico/${w.id}`)}
            toolbar={<>
              <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Número, placa ou descrição" />
              <select className="nc-select" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Situação">
                <option value="">Todas as situações</option>
                {(Object.keys(WORK_ORDER_STATUS_LABEL) as WorkOrderStatus[]).map((s) => <option key={s} value={s}>{WORK_ORDER_STATUS_LABEL[s]}</option>)}
              </select>
            </>}
            empty={{ title: 'Nenhuma ordem de serviço', description: 'Abra uma OS para registrar manutenção, peças e custos do veículo.', icon: Wrench }}
            footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
        </Card>
      ) : (
        <Board rows={list.data?.items ?? []} onOpen={(id) => navigate(`/operacao/ordens-servico/${id}`)} />
      )}
      {creating && <NewWorkOrderModal params={params} onClose={() => setParams({})} onCreated={(id) => navigate(`/operacao/ordens-servico/${id}`)} />}
    </Page>
  );
}

function Board({ rows, onOpen }: { rows: WorkOrderRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="op-kanban">
      {OPEN_COLUMNS.map((s) => {
        const items = rows.filter((r) => r.status === s);
        return (
          <section key={s} className="op-kanban__col" aria-label={WORK_ORDER_STATUS_LABEL[s]}>
            <div className="op-kanban__title"><span>{WORK_ORDER_STATUS_LABEL[s]}</span><span className="muted">{items.length}</span></div>
            {items.map((w) => (
              <button key={w.id} type="button" className="op-kanban__card" data-overdue={w.overdue} onClick={() => onOpen(w.id)}>
                <span className="row-between"><span className="strong mono small">{w.number}</span><Plate value={w.vehicle.plate} /></span>
                <span className="small">{w.serviceType.name}</span>
                <span className="xsmall muted ellipsis">{w.description}</span>
                <span className="row-between"><Badge tone={PRIORITY_TONE[w.priority]}>{PRIORITY_LABEL[w.priority]}</Badge><span className={`xsmall ${w.overdue ? 'text-danger' : 'muted'}`}>{w.dueAt ? date(w.dueAt) : 'Sem prazo'}</span></span>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function NewWorkOrderModal({ params, onClose, onCreated }: { params: URLSearchParams; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const types = useApi(() => api.get<{ id: string; name: string; active: boolean }[]>('/maintenance/service-types'), []);
  const [vehicleUnitId, setVehicle] = useState<string | null>(params.get('vehicleUnitId'));
  const claimId = params.get('claimId');
  const [serviceTypeId, setType] = useState('');
  const [kind, setKind] = useState<'CORRECTIVE' | 'PREVENTIVE'>(claimId ? 'CORRECTIVE' : 'CORRECTIVE');
  const [description, setDescription] = useState(params.get('description') ?? '');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueAt, setDue] = useState('');
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<number | ''>('');
  const [odometer, setOdometer] = useState('');
  const [blocks, setBlocks] = useState(true);
  const [busy, setBusy] = useState(false);
  const active = useMemo(() => (types.data ?? []).filter((t) => t.active), [types.data]);

  const typeId = serviceTypeId || active[0]?.id || '';
  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>('/work-orders', {
        vehicleUnitId, serviceTypeId: typeId, kind, description, priority, dueAt: fromLocalInput(dueAt), supplierId: supplierId ?? undefined,
        estimateAmount: estimate === '' ? undefined : estimate, odometerKm: odometer ? Number(odometer) : undefined, blocksVehicle: blocks,
        claimId: claimId ?? undefined,
      });
      toast.success('Ordem de serviço aberta');
      onCreated(r.id);
    } catch (e) { toast.error('Não foi possível abrir a OS', errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="lg" title="Nova ordem de serviço" description={claimId ? 'Vinculada ao sinistro informado.' : undefined}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!vehicleUnitId || !typeId || description.trim().length < 3} onClick={create}>Abrir OS</Button></>}>
      <FormGrid>
        <Field label="Veículo" required className="span-6"><EntityPicker value={vehicleUnitId} onChange={(v) => setVehicle(v)} load={loadVehicles()} initialLabel={vehicleUnitId ? 'Veículo selecionado' : undefined} /></Field>
        <Field label="Tipo de serviço" required className="span-6"><Select value={typeId} onChange={(e) => setType(e.target.value)} options={active.map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Natureza" className="span-6"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} options={[{ value: 'CORRECTIVE', label: 'Corretiva' }, { value: 'PREVENTIVE', label: 'Preventiva' }]} /></Field>
        <Field label="Prioridade" className="span-6"><Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} /></Field>
        <Field label="Descrição do problema ou serviço" required className="span-12"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></Field>
        <Field label="Prazo" className="span-6" hint="Define até quando o carro fica fora da agenda (padrão: 3 dias)."><Input type="datetime-local" value={dueAt} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Quilometragem atual" className="span-6"><Input inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Oficina / fornecedor" className="span-6"><EntityPicker value={supplierId} onChange={(v) => setSupplier(v)} load={loadSuppliers()} /></Field>
        <Field label="Orçamento" className="span-6" hint="Com orçamento, a OS nasce aguardando aprovação."><MoneyInput value={estimate} onChange={setEstimate} /></Field>
        <div className="span-12"><Checkbox label="Retirar o veículo da agenda enquanto a OS estiver aberta" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} /></div>
      </FormGrid>
    </Modal>
  );
}
