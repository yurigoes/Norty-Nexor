import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { Badge, Button, Card, Page, PageHeader } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input } from '../../components/form';
import { DataTable, type Column } from '../../components/table';
import { Modal } from '../../components/overlay';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';

export interface BranchRow {
  id: string; code: string; name: string; document: string | null; phone: string | null; email: string | null;
  street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; zip: string | null;
  turnaroundHours: number | null; publicVisible: boolean; active: boolean; _count: { vehicles: number };
}

export function BranchesPage() {
  const list = useApi(() => api.get<BranchRow[]>('/branches', { all: 'true' }), []);
  const [editing, setEditing] = useState<BranchRow | 'new' | null>(null);
  const columns: Column<BranchRow>[] = [
    { key: 'name', header: 'Filial', render: (b) => <div><div className="strong">{b.name}</div><div className="xsmall muted mono">{b.code}</div></div> },
    { key: 'city', header: 'Cidade', render: (b) => [b.city, b.state].filter(Boolean).join(' / ') || '—' },
    { key: 'vehicles', header: 'Veículos', align: 'right', render: (b) => b._count.vehicles },
    { key: 'turn', header: 'Preparo entre locações', render: (b) => b.turnaroundHours === null ? <span className="muted">Padrão da empresa</span> : `${b.turnaroundHours} h` },
    { key: 'site', header: 'No site', render: (b) => b.publicVisible ? <Badge tone="info">Visível</Badge> : <Badge>Oculta</Badge> },
    { key: 'status', header: 'Situação', render: (b) => b.active ? <Badge tone="success" dot>Ativa</Badge> : <Badge dot>Inativa</Badge> },
  ];
  return (
    <Page>
      <PageHeader title="Filiais" description="Lojas da empresa. Usuários podem ser limitados a filiais específicas."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Nova filial</Button>} />
      <Card flush>
        <DataTable columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setEditing}
          empty={{ title: 'Nenhuma filial', icon: Building2 }} />
      </Card>
      {editing && <BranchModal branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
    </Page>
  );
}

function BranchModal({ branch, onClose, onSaved }: { branch: BranchRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    code: branch?.code ?? '', name: branch?.name ?? '', document: branch?.document ?? '', phone: branch?.phone ?? '', email: branch?.email ?? '',
    street: branch?.street ?? '', number: branch?.number ?? '', district: branch?.district ?? '', city: branch?.city ?? '', state: branch?.state ?? '', zip: branch?.zip ?? '',
    turnaroundHours: branch?.turnaroundHours ?? '' as number | '', publicVisible: branch?.publicVisible ?? true, active: branch?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true);
    const clean = (v: string) => (v.trim() ? v.trim() : undefined);
    const body = {
      name: f.name, document: clean(f.document), phone: clean(f.phone), email: clean(f.email), street: clean(f.street), number: clean(f.number),
      district: clean(f.district), city: clean(f.city), state: clean(f.state.toUpperCase()), zip: clean(f.zip),
      turnaroundHours: f.turnaroundHours === '' ? null : Number(f.turnaroundHours), publicVisible: f.publicVisible,
    };
    try {
      if (branch) await api.patch(`/branches/${branch.id}`, { ...body, active: f.active });
      else await api.post('/branches', { ...body, code: f.code.toUpperCase() });
      toast.success(branch ? 'Filial atualizada' : 'Filial criada');
      onSaved();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={branch ? branch.name : 'Nova filial'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.name || (!branch && !f.code)} onClick={save}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Código" required className="span-3" hint="Ex.: MTZ, BH01"><Input value={f.code} onChange={set('code')} disabled={Boolean(branch)} maxLength={12} /></Field>
        <Field label="Nome" required className="span-6"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="CNPJ" className="span-3"><Input value={f.document} onChange={set('document')} /></Field>
        <Field label="Telefone" className="span-4"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="E-mail" className="span-8"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Logradouro" className="span-6"><Input value={f.street} onChange={set('street')} /></Field>
        <Field label="Número" className="span-3"><Input value={f.number} onChange={set('number')} /></Field>
        <Field label="Bairro" className="span-3"><Input value={f.district} onChange={set('district')} /></Field>
        <Field label="Cidade" className="span-6"><Input value={f.city} onChange={set('city')} /></Field>
        <Field label="UF" className="span-3"><Input value={f.state} onChange={set('state')} maxLength={2} /></Field>
        <Field label="CEP" className="span-3"><Input value={f.zip} onChange={set('zip')} /></Field>
        <Field label="Horas de preparo entre locações" className="span-6" hint="Vazio usa a regra da empresa.">
          <Input type="number" min={0} max={72} value={f.turnaroundHours} onChange={(e) => setF({ ...f, turnaroundHours: e.target.value === '' ? '' : Number(e.target.value) })} />
        </Field>
        <div className="span-6 stack-sm" style={{ justifyContent: 'center' }}>
          <Checkbox label="Exibir no site público" checked={f.publicVisible} onChange={set('publicVisible')} />
          {branch && <Checkbox label="Filial ativa" checked={f.active} onChange={set('active')} />}
        </div>
      </FormGrid>
    </Modal>
  );
}
