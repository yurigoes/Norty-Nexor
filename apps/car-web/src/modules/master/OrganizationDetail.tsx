import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, LifeBuoy, PlayCircle, Save, XCircle } from 'lucide-react';
import { MODULE_LABEL, PERMISSIONS, SUPPORT_GRANTABLE, type ModuleKey, type OrganizationSummary, type PlanRow } from '@nortycar/shared';
import { Alert, Badge, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Progress, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { DataTable } from '../../components/table';
import { Modal, useConfirm } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, dateTime, money } from '../../lib/format';
import { useSession } from '../../lib/session';

interface OrgDetail extends OrganizationSummary {
  administrators: { name: string; email: string; role: string; mfaEnabled: boolean }[];
  domains: { id: string; hostname: string; status: string; kind: string }[];
  invoices: { id: string; competence: string; amount: number; dueDate: string; status: string; paidAt: string | null }[];
  grants: { id: string; purpose: string; status: string; createdAt: string; expiresAt: string | null; requestedBy: { name: string } }[];
  history: { id: string; at: string; action: string; actorName: string | null; reason: string | null }[];
}

export function OrganizationDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const org = useApi(() => api.get<OrgDetail>(`/platform/organizations/${id}`), [id]);
  const [tab, setTab] = useState<'overview' | 'billing' | 'support' | 'history'>('overview');
  const [granting, setGranting] = useState(false);

  if (org.loading && !org.data) return <LoadingBlock />;
  if (org.error || !org.data) return <ErrorState message={org.error ?? 'Sem dados'} onRetry={org.reload} />;
  const o = org.data;

  const changeStatus = async (status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED') => {
    const r = await confirm({
      title: status === 'ACTIVE' ? 'Reativar empresa' : status === 'SUSPENDED' ? 'Suspender empresa' : 'Encerrar empresa',
      message: status === 'SUSPENDED' ? 'A equipe da empresa perde o acesso na próxima ação e verá o motivo. O site público sai do ar.' : status === 'CLOSED' ? 'Encerramento é definitivo: sessões são encerradas e a assinatura cancelada. Os dados ficam preservados.' : 'A equipe volta a acessar normalmente.',
      requireReason: true, confirmLabel: status === 'ACTIVE' ? 'Reativar' : status === 'SUSPENDED' ? 'Suspender' : 'Encerrar', tone: status === 'ACTIVE' ? 'primary' : 'danger',
    });
    if (!r.confirmed) return;
    if (r.reason.length < 5) return toast.error('Descreva o motivo com ao menos 5 caracteres.');
    api.post(`/platform/organizations/${id}/status`, { status, reason: r.reason }).then(() => { toast.success('Situação atualizada'); org.reload(); }).catch((e) => toast.error(errorMessage(e)));
  };

  return (
    <Page>
      <PageHeader breadcrumb={<><Link to="/master/empresas">Empresas</Link> / {o.name}</>} title={o.name}
        description={<span className="row"><Status kind="org" value={o.status} /> <span className="mono small">{o.slug}</span>{o.statusReason && <span className="small muted">· {o.statusReason}</span>}</span>}
        actions={can('platform.orgs.manage') && <>
          {can('platform.support') && <Button icon={LifeBuoy} onClick={() => setGranting(true)}>Pedir acesso de suporte</Button>}
          {o.status === 'SUSPENDED' ? <Button variant="primary" icon={PlayCircle} onClick={() => changeStatus('ACTIVE')}>Reativar</Button>
            : o.status !== 'CLOSED' && <Button icon={Ban} onClick={() => changeStatus('SUSPENDED')}>Suspender</Button>}
          {o.status !== 'CLOSED' && <Button variant="danger" icon={XCircle} onClick={() => changeStatus('CLOSED')}>Encerrar</Button>}
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Visão geral' }, { value: 'billing', label: 'Assinatura e faturas', hidden: !can('platform.billing.manage') },
        { value: 'support', label: 'Acessos de suporte', count: o.grants.length }, { value: 'history', label: 'Histórico' },
      ]} />
      {tab === 'overview' && <Overview o={o} onSaved={org.reload} />}
      {tab === 'billing' && <Billing o={o} onSaved={org.reload} />}
      {tab === 'support' && (
        <Card flush>
          <DataTable rows={o.grants} empty={{ title: 'Nenhum pedido de acesso' }} columns={[
            { key: 'who', header: 'Solicitante', render: (g) => g.requestedBy.name },
            { key: 'purpose', header: 'Finalidade', render: (g) => g.purpose },
            { key: 'at', header: 'Pedido em', render: (g) => dateTime(g.createdAt) },
            { key: 'exp', header: 'Válido até', render: (g) => dateTime(g.expiresAt) },
            { key: 'status', header: 'Situação', render: (g) => <Status kind="grant" value={g.status} /> },
          ]} />
        </Card>
      )}
      {tab === 'history' && (
        <Card flush>
          <DataTable rows={o.history} empty={{ title: 'Sem alterações administrativas' }} columns={[
            { key: 'at', header: 'Quando', render: (h) => dateTime(h.at) },
            { key: 'who', header: 'Quem', render: (h) => h.actorName ?? '—' },
            { key: 'action', header: 'Ação', render: (h) => <span className="mono small">{h.action}</span> },
            { key: 'reason', header: 'Motivo', render: (h) => h.reason ?? '' },
          ]} />
        </Card>
      )}
      {granting && <GrantModal organizationId={o.id} onClose={() => setGranting(false)} onDone={() => { setGranting(false); org.reload(); }} />}
    </Page>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? (used / limit) * 100 : 0;
  return (
    <div className="stack-sm">
      <div className="row-between small"><span>{label}</span><span className="tnum">{used} de {limit ?? 'ilimitado'}</span></div>
      {limit !== null && <Progress value={pct} tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : undefined} />}
    </div>
  );
}

function Overview({ o, onSaved }: { o: OrgDetail; onSaved: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [modules, setModules] = useState<string[]>(o.extraModules);
  const [f, setF] = useState({ name: o.name, legalName: o.legalName ?? '', email: o.email ?? '', phone: o.phone ?? '' });
  const save = () => api.patch(`/platform/organizations/${o.id}`, { name: f.name, legalName: f.legalName || undefined, email: f.email || undefined, phone: f.phone || undefined, extraModules: modules })
    .then(() => { toast.success('Empresa atualizada'); onSaved(); }).catch((e) => toast.error(errorMessage(e)));
  return (
    <div className="grid-2">
      <Card title="Dados cadastrais" actions={can('platform.orgs.manage') && <Button size="sm" variant="primary" icon={Save} onClick={save}>Salvar</Button>}>
        <FormGrid>
          <Field label="Nome fantasia" className="span-6"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Razão social" className="span-6"><Input value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} /></Field>
          <Field label="E-mail" className="span-6"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Telefone" className="span-6"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </FormGrid>
        <div style={{ marginTop: 16 }}><KeyValue items={[{ label: 'CNPJ', value: o.document ?? '—' }, { label: 'Cliente desde', value: date(o.createdAt) }]} /></div>
      </Card>
      <Card title="Uso × limites do plano">
        <div className="stack">
          <Usage label="Veículos" used={o.usage.vehicles} limit={o.limits?.vehicles ?? null} />
          <Usage label="Filiais" used={o.usage.branches} limit={o.limits?.branches ?? null} />
          <Usage label="Usuários" used={o.usage.users} limit={o.limits?.users ?? null} />
        </div>
      </Card>
      <Card title="Administradores da conta" subtitle="Contato da conta — não inclui dados operacionais." flush>
        <ul className="nc-list">
          {o.administrators.map((a) => (
            <li key={a.email}><div className="grow"><div className="strong">{a.name}</div><div className="xsmall muted">{a.email} · {a.role}</div></div>{a.mfaEnabled ? <Badge tone="success">MFA</Badge> : <Badge>Sem MFA</Badge>}</li>
          ))}
        </ul>
      </Card>
      <Card title="Módulos extras" subtitle="Além dos módulos do plano." actions={can('platform.orgs.manage') && <Button size="sm" onClick={save}>Aplicar</Button>}>
        <div className="grid-2" style={{ gap: 6 }}>
          {(Object.keys(MODULE_LABEL) as ModuleKey[]).filter((m) => !['core', 'fleet', 'rentals'].includes(m)).map((m) => (
            <Checkbox key={m} label={MODULE_LABEL[m]} checked={modules.includes(m)} disabled={!can('platform.orgs.manage')}
              onChange={(e) => setModules((list) => (e.target.checked ? [...list, m] : list.filter((x) => x !== m)))} />
          ))}
        </div>
      </Card>
      <Card title="Domínios" flush>
        {o.domains.length ? (
          <ul className="nc-list">{o.domains.map((d) => <li key={d.id}><span className="grow mono small">{d.hostname}</span><Status kind="domain" value={d.status} /></li>)}</ul>
        ) : <div className="nc-card__body muted small">Nenhum domínio. O subdomínio Norty é criado quando o site é publicado.</div>}
      </Card>
    </div>
  );
}

function Billing({ o, onSaved }: { o: OrgDetail; onSaved: () => void }) {
  const toast = useToast();
  const plans = useApi(() => api.get<PlanRow[]>('/platform/plans'), []);
  const [planId, setPlanId] = useState(o.subscription?.planId ?? '');
  const [status, setStatus] = useState(o.subscription?.status ?? 'ACTIVE');
  const [price, setPrice] = useState<number | ''>(o.subscription?.priceOverride ?? '');
  const [reason, setReason] = useState('');
  const save = () => api.patch(`/platform/organizations/${o.id}/subscription`, { planId, status, priceOverride: price === '' ? null : price, reason: reason || undefined })
    .then(() => { toast.success('Assinatura atualizada'); setReason(''); onSaved(); }).catch((e) => toast.error(errorMessage(e)));
  return (
    <div className="stack">
      <Card title="Assinatura" actions={<Button size="sm" variant="primary" icon={Save} onClick={save}>Salvar</Button>}>
        <FormGrid>
          <Field label="Plano" className="span-4"><Select value={planId} onChange={(e) => setPlanId(e.target.value)} options={(plans.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${money(p.priceMonthly)}` }))} /></Field>
          <Field label="Situação" className="span-4"><Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} options={[{ value: 'TRIALING', label: 'Em avaliação' }, { value: 'ACTIVE', label: 'Ativa' }, { value: 'PAST_DUE', label: 'Em atraso' }, { value: 'CANCELED', label: 'Cancelada' }]} /></Field>
          <Field label="Preço negociado" className="span-4" hint="Vazio = preço do plano."><MoneyInput value={price} onChange={setPrice} /></Field>
          <Field label="Motivo da alteração" className="span-12"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
        </FormGrid>
        {o.subscription?.trialEndsAt && <Alert tone="info">Avaliação até {date(o.subscription.trialEndsAt)}.</Alert>}
      </Card>
      <Card title="Faturas do SaaS" flush>
        <DataTable rows={o.invoices} empty={{ title: 'Nenhuma fatura gerada' }} columns={[
          { key: 'comp', header: 'Competência', render: (i) => i.competence },
          { key: 'amount', header: 'Valor', align: 'right', render: (i) => money(i.amount) },
          { key: 'due', header: 'Vencimento', render: (i) => date(i.dueDate) },
          { key: 'status', header: 'Situação', render: (i) => <Status kind="saasInvoice" value={i.status === 'OPEN' && new Date(i.dueDate) < new Date() ? 'OVERDUE' : i.status} /> },
          { key: 'paid', header: 'Pago em', render: (i) => dateTime(i.paidAt) },
        ]} />
      </Card>
    </div>
  );
}

function GrantModal({ organizationId, onClose, onDone }: { organizationId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [purpose, setPurpose] = useState('');
  const [scope, setScope] = useState<string[]>(['dashboard.view']);
  const [hours, setHours] = useState(4);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} size="lg" title="Pedir acesso excepcional de suporte"
      description="A empresa decide. O acesso é somente leitura, limitado ao escopo e ao prazo, e tudo fica na trilha de auditoria dela."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={purpose.trim().length < 10 || !scope.length} onClick={async () => {
        setBusy(true);
        try { await api.post('/platform/support-grants', { organizationId, purpose, scope, durationHours: hours }); toast.success('Pedido enviado', 'A empresa precisa autorizar na tela Suporte Norty.'); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Enviar pedido</Button></>}>
      <div className="stack">
        <Field label="Finalidade" required hint="Ex.: investigar divergência no chamado #123. Mínimo de 10 caracteres."><Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
        <Field label="Prazo (horas)" required><Input type="number" min={1} max={72} value={hours} onChange={(e) => setHours(Math.max(1, Math.min(72, Number(e.target.value))))} /></Field>
        <fieldset className="nc-fieldset">
          <legend>Escopo (somente leitura)</legend>
          <div className="grid-2" style={{ gap: 6 }}>
            {SUPPORT_GRANTABLE.map((p) => (
              <Checkbox key={p} label={PERMISSIONS[p].label} checked={scope.includes(p)} onChange={(e) => setScope((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))} />
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
