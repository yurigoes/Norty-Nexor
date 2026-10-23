import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Copy, Plus } from 'lucide-react';
import type { AccessLinkResult, OrganizationSummary, Paginated, PlanRow } from '@nortycar/shared';
import { ORGANIZATION_STATUS_LABEL } from '@nortycar/shared';
import { Alert, Button, Card, Page, PageHeader } from '../../components/ui';
import { Field, FormGrid, Input, Select } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Modal } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, money } from '../../lib/format';

export function OrganizationsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<OrganizationSummary>>('/platform/organizations', { q: term, status, page, pageSize: 25 }), [term, status, page]);
  const toast = useToast();

  const columns: Column<OrganizationSummary>[] = [
    { key: 'name', header: 'Empresa', render: (o) => <div><div className="strong">{o.name}</div><div className="xsmall muted mono">{o.slug}</div></div> },
    { key: 'plan', header: 'Plano', render: (o) => o.subscription ? <div><div>{o.subscription.planName}</div><div className="xsmall muted">{money(o.subscription.price)}/mês</div></div> : '—' },
    { key: 'sub', header: 'Assinatura', render: (o) => <Status kind="subscription" value={o.subscription?.status} /> },
    { key: 'usage', header: 'Uso', render: (o) => <span className="small tnum">{o.usage.vehicles} veíc. · {o.usage.branches} fil. · {o.usage.users} usu.</span> },
    { key: 'created', header: 'Desde', render: (o) => date(o.createdAt) },
    { key: 'status', header: 'Situação', render: (o) => <Status kind="org" value={o.status} /> },
  ];

  return (
    <Page>
      <PageHeader title="Empresas" description="Locadoras contratantes, plano, uso e situação." actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Nova empresa</Button>} />
      {link && (
        <Alert tone="warning" title="Entregue este link ao proprietário" action={<Button size="sm" icon={Copy} onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copiado'))}>Copiar</Button>}>
          O e-mail não está configurado. O link permite definir a senha por 60 minutos e não será exibido de novo:
          <div className="mono small" style={{ wordBreak: 'break-all', marginTop: 6 }}>{link}</div>
        </Alert>
      )}
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={(o) => navigate(`/master/empresas/${o.id}`)}
          empty={{ title: 'Nenhuma empresa encontrada', icon: Building2 }}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Nome, identificador ou CNPJ" />
            <select className="nc-select" style={{ width: 200 }} value={status} aria-label="Situação" onChange={(e) => { setParams(e.target.value ? { status: e.target.value } : {}); setPage(1); }}>
              <option value="">Todas as situações</option>
              {Object.entries(ORGANIZATION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </>}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      {creating && <CreateOrganizationModal onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); list.reload(); if (r.accessLink) setLink(r.accessLink); }} />}
    </Page>
  );
}

function CreateOrganizationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: AccessLinkResult & { id: string }) => void }) {
  const toast = useToast();
  const plans = useApi(() => api.get<PlanRow[]>('/platform/plans'), []);
  const [f, setF] = useState({ name: '', legalName: '', document: '', slug: '', email: '', phone: '', planId: '', trialDays: 14, branchCode: 'MTZ', branchName: 'Matriz', branchCity: '', branchState: '', ownerName: '', ownerEmail: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const slugify = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42);
  const save = async () => {
    setBusy(true);
    const opt = (v: string) => (v.trim() ? v.trim() : undefined);
    try {
      const r = await api.post<AccessLinkResult & { id: string }>('/platform/organizations', {
        name: f.name, legalName: opt(f.legalName), document: opt(f.document), slug: f.slug, email: opt(f.email), phone: opt(f.phone), planId: f.planId,
        trialDays: Number(f.trialDays), branchCode: f.branchCode.toUpperCase(), branchName: f.branchName, branchCity: opt(f.branchCity), branchState: opt(f.branchState.toUpperCase()),
        ownerName: f.ownerName, ownerEmail: f.ownerEmail,
      });
      toast.success('Empresa criada', r.isNewUser ? (r.emailStatus === 'SENT' ? 'O convite foi enviado ao proprietário.' : 'Copie o link de acesso exibido.') : 'O proprietário já tinha conta e recebeu o acesso.');
      onCreated(r);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const valid = f.name && f.slug.length >= 3 && f.planId && f.branchCode && f.branchName && f.ownerName && f.ownerEmail;
  return (
    <Modal open onClose={onClose} size="lg" title="Nova empresa" description="Cria a conta com filial, perfis-modelo, catálogo de referência e o proprietário. Nenhum dado operacional é criado."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={save}>Criar empresa</Button></>}>
      <FormGrid>
        <Field label="Nome fantasia" required className="span-6"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug || slugify(e.target.value) })} /></Field>
        <Field label="Identificador (endereço do site)" required className="span-6" hint="Letras minúsculas, números e hífen."><Input value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></Field>
        <Field label="Razão social" className="span-6"><Input value={f.legalName} onChange={set('legalName')} /></Field>
        <Field label="CNPJ" className="span-6"><Input value={f.document} onChange={set('document')} /></Field>
        <Field label="E-mail da empresa" className="span-6"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Telefone" className="span-6"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Plano" required className="span-8"><Select value={f.planId} onChange={set('planId')} placeholder="Selecione" options={(plans.data ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name} · ${money(p.priceMonthly)}/mês` }))} /></Field>
        <Field label="Dias de avaliação" className="span-4"><Input type="number" min={0} max={90} value={f.trialDays} onChange={set('trialDays')} /></Field>
        <Field label="Código da 1ª filial" required className="span-3"><Input value={f.branchCode} onChange={set('branchCode')} maxLength={12} /></Field>
        <Field label="Nome da filial" required className="span-4"><Input value={f.branchName} onChange={set('branchName')} /></Field>
        <Field label="Cidade" className="span-3"><Input value={f.branchCity} onChange={set('branchCity')} /></Field>
        <Field label="UF" className="span-3"><Input value={f.branchState} onChange={set('branchState')} maxLength={2} /></Field>
        <Field label="Nome do proprietário" required className="span-6"><Input value={f.ownerName} onChange={set('ownerName')} /></Field>
        <Field label="E-mail do proprietário" required className="span-6"><Input type="email" value={f.ownerEmail} onChange={set('ownerEmail')} /></Field>
      </FormGrid>
    </Modal>
  );
}
