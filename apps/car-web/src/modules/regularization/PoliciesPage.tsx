/* Apólices de seguro e veículos cobertos. A seguradora é um fornecedor do cadastro. */
import { useState } from 'react';
import { Car, Plus, Shield, X } from 'lucide-react';
import type { PolicyItem } from '@nortycar/shared';
import { Badge, Button, Card, Page, PageHeader } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Textarea } from '../../components/form';
import { DataTable, type Column } from '../../components/table';
import { Modal } from '../../components/overlay';
import { EntityPicker, type PickerOption } from '../../components/picker';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, money, plate } from '../../lib/format';
import { loadSuppliers, loadVehicles } from '../../lib/pickers';
import { useSession } from '../../lib/session';
import { daysTo } from './deadlines';

export function PoliciesPage() {
  const { can } = useSession();
  const list = useApi((signal) => api.get<PolicyItem[]>('/insurance/policies', undefined, signal), []);
  const [editing, setEditing] = useState<PolicyItem | 'new' | null>(null);
  const [vehiclesOf, setVehiclesOf] = useState<PolicyItem | null>(null);
  const columns: Column<PolicyItem>[] = [
    { key: 'number', header: 'Apólice', render: (p) => <div><div className="strong">{p.policyNumber}</div><div className="xsmall muted">{p.insurer.name}</div></div> },
    { key: 'term', header: 'Vigência', render: (p) => {
      const left = daysTo(p.endsAt);
      return <div><div className="small">{date(p.startsAt)} a {date(p.endsAt)}</div>{p.active && left <= 30 && <Badge tone={left < 0 ? 'danger' : 'warning'}>{left < 0 ? 'Vencida' : `Vence em ${left} d`}</Badge>}</div>;
    } },
    { key: 'deductible', header: 'Franquia', align: 'right', render: (p) => money(p.deductible) },
    { key: 'premium', header: 'Prêmio', align: 'right', render: (p) => money(p.premium) },
    { key: 'vehicles', header: 'Veículos', render: (p) => (
      <Button size="sm" variant="ghost" icon={Car} onClick={(e) => { e.stopPropagation(); setVehiclesOf(p); }}>{p.vehicles.length}</Button>
    ) },
    { key: 'claims', header: 'Sinistros', align: 'right', render: (p) => p._count.claims },
    { key: 'status', header: 'Situação', render: (p) => p.active ? <Badge tone="success" dot>Ativa</Badge> : <Badge dot>Inativa</Badge> },
  ];
  return (
    <Page>
      <PageHeader title="Seguros" description="Apólices da frota, vigência, franquia e veículos cobertos. O vencimento entra nos alertas."
        actions={can('claims.manage') && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Nova apólice</Button>} />
      <Card flush>
        <DataTable columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={can('claims.manage') ? setEditing : undefined} empty={{ title: 'Nenhuma apólice cadastrada', icon: Shield }} />
      </Card>
      {editing && <PolicyModal policy={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      {vehiclesOf && <VehiclesModal policy={vehiclesOf} canEdit={can('claims.manage')} onClose={() => setVehiclesOf(null)} onSaved={() => { setVehiclesOf(null); list.reload(); }} />}
    </Page>
  );
}

function PolicyModal({ policy, onClose, onSaved }: { policy: PolicyItem | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [insurerId, setInsurer] = useState<string | null>(policy?.insurerId ?? null);
  const [f, setF] = useState({
    policyNumber: policy?.policyNumber ?? '', startsAt: policy?.startsAt.slice(0, 10) ?? '', endsAt: policy?.endsAt.slice(0, 10) ?? '',
    coverage: policy?.coverage ?? '', notes: policy?.notes ?? '', active: policy?.active ?? true,
  });
  const [deductible, setDeductible] = useState<number | ''>(policy?.deductible ?? '');
  const [premium, setPremium] = useState<number | ''>(policy?.premium ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const body = {
      policyNumber: f.policyNumber, startsAt: f.startsAt, endsAt: f.endsAt, coverage: f.coverage || undefined, notes: f.notes || undefined,
      deductible: deductible === '' ? undefined : deductible, premium: premium === '' ? undefined : premium, active: f.active,
    };
    try {
      if (policy) await api.patch(`/insurance/policies/${policy.id}`, body);
      else await api.post('/insurance/policies', { ...body, insurerId });
      toast.success(policy ? 'Apólice atualizada' : 'Apólice cadastrada');
      onSaved();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={policy ? `Apólice ${policy.policyNumber}` : 'Nova apólice'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.policyNumber || !f.startsAt || !f.endsAt || (!policy && !insurerId)} onClick={save}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Seguradora" required className="span-6" hint="Cadastrada em Fornecedores.">
          <EntityPicker value={insurerId} onChange={(id) => setInsurer(id)} load={loadSuppliers()} disabled={Boolean(policy)} initialLabel={policy?.insurer.name} />
        </Field>
        <Field label="Número da apólice" required className="span-6"><Input value={f.policyNumber} onChange={(e) => setF({ ...f, policyNumber: e.target.value })} /></Field>
        <Field label="Início da vigência" required className="span-3"><Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Fim da vigência" required className="span-3"><Input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <Field label="Franquia" className="span-3"><MoneyInput value={deductible} onChange={setDeductible} /></Field>
        <Field label="Prêmio" className="span-3"><MoneyInput value={premium} onChange={setPremium} /></Field>
        <Field label="Coberturas"><Textarea value={f.coverage} onChange={(e) => setF({ ...f, coverage: e.target.value })} /></Field>
        <Field label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="span-12"><Checkbox label="Apólice ativa" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /></div>
      </FormGrid>
    </Modal>
  );
}

function VehiclesModal({ policy, canEdit, onClose, onSaved }: { policy: PolicyItem; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [vehicles, setVehicles] = useState<{ id: string; label: string }[]>(policy.vehicles.map((v) => ({ id: v.id, label: plate(v.plate) })));
  const add = (_id: string | null, option: PickerOption | null) => {
    if (option && !vehicles.some((v) => v.id === option.id)) setVehicles([...vehicles, { id: option.id, label: option.label }]);
  };
  return (
    <Modal open onClose={onClose} title={`Veículos da apólice ${policy.policyNumber}`}
      footer={canEdit ? <><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => api.put(`/insurance/policies/${policy.id}/vehicles`, { vehicleUnitIds: vehicles.map((v) => v.id) }).then(() => { toast.success('Veículos atualizados'); onSaved(); }).catch((e) => toast.error(errorMessage(e)))}>Salvar</Button></> : undefined}>
      <div className="stack">
        {canEdit && <Field label="Adicionar veículo"><EntityPicker value={null} onChange={add} load={loadVehicles()} /></Field>}
        {vehicles.length ? (
          <ul className="nc-list nc-card">
            {vehicles.map((v) => (
              <li key={v.id}><span className="grow">{v.label}</span>{canEdit && <Button size="sm" variant="ghost" icon={X} aria-label={`Remover ${v.label}`} onClick={() => setVehicles(vehicles.filter((x) => x.id !== v.id))} />}</li>
            ))}
          </ul>
        ) : <p className="small muted">Nenhum veículo vinculado.</p>}
      </div>
    </Modal>
  );
}
