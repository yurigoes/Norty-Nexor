/* Telas do Master Norty: planos, assinaturas, domínios, suporte, saúde, auditoria, equipe, integrações e configurações. */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Copy, FileClock, Globe, Plus, RefreshCw, Save, Send, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import {
  MODULE_LABEL, PLATFORM_ROLE_LABEL, SUPPORT_TICKET_STATUS_LABEL, type AccessLinkResult, type AuditEntry, type IntegrationHealth, type ModuleKey,
  type Paginated, type PlanRow, type StaffMember,
} from '@nortycar/shared';
import { Alert, Badge, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, StatCard, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Drawer, Modal, useConfirm } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, dateTime, int, money, relative } from '../../lib/format';
import { useSession } from '../../lib/session';

/* ================= Planos ================= */

export function PlansPage() {
  const { can } = useSession();
  const list = useApi(() => api.get<PlanRow[]>('/platform/plans'), []);
  const [editing, setEditing] = useState<PlanRow | 'new' | null>(null);
  return (
    <Page>
      <PageHeader title="Planos" description="Preço, limites e módulos de cada plano comercial do SaaS." actions={can('platform.plans.manage') && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Novo plano</Button>} />
      <Card flush>
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={can('platform.plans.manage') ? setEditing : undefined} columns={[
          { key: 'name', header: 'Plano', render: (p) => <div><div className="strong">{p.name}</div><div className="xsmall muted">{p.description}</div></div> },
          { key: 'price', header: 'Preço/mês', align: 'right', render: (p) => p.priceMonthly > 0 ? money(p.priceMonthly) : <Badge tone="warning">Preço a definir</Badge> },
          { key: 'limits', header: 'Limites', render: (p) => <span className="small">{p.maxVehicles ?? '∞'} veíc. · {p.maxBranches ?? '∞'} fil. · {p.maxUsers ?? '∞'} usu.</span> },
          { key: 'modules', header: 'Módulos', render: (p) => <span className="small">{p.modules.length}</span> },
          { key: 'subs', header: 'Assinaturas', align: 'right', render: (p) => p._count.subscriptions },
          { key: 'active', header: 'Situação', render: (p) => p.active ? <Badge tone="success" dot>Ativo</Badge> : <Badge dot>Inativo</Badge> },
        ]} />
      </Card>
      {editing && <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
    </Page>
  );
}

function PlanModal({ plan, onClose, onSaved }: { plan: PlanRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    code: plan?.code ?? '', name: plan?.name ?? '', description: plan?.description ?? '', priceMonthly: plan?.priceMonthly ?? ('' as number | ''),
    maxVehicles: plan?.maxVehicles ?? ('' as number | ''), maxBranches: plan?.maxBranches ?? ('' as number | ''), maxUsers: plan?.maxUsers ?? ('' as number | ''),
    modules: plan?.modules ?? ['core', 'fleet', 'rentals'], active: plan?.active ?? true,
  });
  const n = (v: number | '') => (v === '' ? null : Number(v));
  const save = async () => {
    const body = { name: f.name, description: f.description || undefined, priceMonthly: Number(f.priceMonthly || 0), maxVehicles: n(f.maxVehicles), maxBranches: n(f.maxBranches), maxUsers: n(f.maxUsers), modules: f.modules, active: f.active };
    try {
      if (plan) await api.patch(`/platform/plans/${plan.id}`, body);
      else await api.post('/platform/plans', { ...body, code: f.code });
      toast.success('Plano salvo');
      onSaved();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={plan ? plan.name : 'Novo plano'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!f.name || (!plan && !f.code)} onClick={save}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Código" required className="span-4"><Input value={f.code} disabled={Boolean(plan)} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} /></Field>
        <Field label="Nome" required className="span-8"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Descrição" className="span-12"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} /></Field>
        <Field label="Preço mensal" className="span-3"><MoneyInput value={f.priceMonthly} onChange={(v) => setF({ ...f, priceMonthly: v })} /></Field>
        <Field label="Máx. veículos" className="span-3" hint="Vazio = ilimitado"><Input type="number" min={1} value={f.maxVehicles} onChange={(e) => setF({ ...f, maxVehicles: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
        <Field label="Máx. filiais" className="span-3"><Input type="number" min={1} value={f.maxBranches} onChange={(e) => setF({ ...f, maxBranches: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
        <Field label="Máx. usuários" className="span-3"><Input type="number" min={1} value={f.maxUsers} onChange={(e) => setF({ ...f, maxUsers: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
        <fieldset className="nc-fieldset span-12">
          <legend>Módulos</legend>
          <div className="grid-3" style={{ gap: 6 }}>
            {(Object.keys(MODULE_LABEL) as ModuleKey[]).map((m) => (
              <Checkbox key={m} label={MODULE_LABEL[m]} checked={f.modules.includes(m)} disabled={['core', 'fleet', 'rentals'].includes(m)}
                onChange={(e) => setF({ ...f, modules: e.target.checked ? [...f.modules, m] : f.modules.filter((x) => x !== m) })} />
            ))}
          </div>
        </fieldset>
        <div className="span-12"><Checkbox label="Plano ativo (disponível para novas empresas)" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /></div>
      </FormGrid>
    </Modal>
  );
}

/* ================= Assinaturas e faturas ================= */

interface Invoice { id: string; competence: string; amount: number; dueDate: string; status: string; paidAt: string | null; notes: string | null; organization: { id: string; name: string } }

export function SubscriptionsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [page, setPage] = useState(1);
  const list = useApi(() => api.get<Paginated<Invoice>>('/platform/invoices', { status, page, pageSize: 50 }), [status, page]);
  const now = new Date();
  const [competence, setCompetence] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [dueDay, setDueDay] = useState(10);
  const generate = () => api.post<{ created: number; eligible: number; skippedZero: number }>('/platform/invoices/generate', { competence, dueDay })
    .then((r) => { toast.success(`${r.created} fatura(s) gerada(s)`, `${r.eligible} assinatura(s) cobrável(is)${r.skippedZero ? `; ${r.skippedZero} sem preço definido` : ''}. Repetir não duplica.`); list.reload(); })
    .catch((e) => toast.error(errorMessage(e)));
  const act = async (inv: Invoice, kind: 'pay' | 'void') => {
    const r = await confirm({ title: kind === 'pay' ? 'Registrar pagamento' : 'Cancelar fatura', message: kind === 'pay' ? `Baixa manual de ${money(inv.amount)} de ${inv.organization.name}.` : 'A fatura deixa de ser cobrada.', requireReason: true, reasonLabel: kind === 'pay' ? 'Referência do pagamento (ex.: TED, Pix)' : 'Motivo', tone: kind === 'pay' ? 'primary' : 'danger', confirmLabel: kind === 'pay' ? 'Dar baixa' : 'Cancelar fatura' });
    if (!r.confirmed) return;
    api.post(`/platform/invoices/${inv.id}/${kind}`, kind === 'pay' ? { reference: r.reason } : { reason: r.reason }).then(() => { toast.success('Registrado'); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
  };
  const columns: Column<Invoice>[] = [
    { key: 'org', header: 'Empresa', render: (i) => <Link to={`/master/empresas/${i.organization.id}`}>{i.organization.name}</Link> },
    { key: 'comp', header: 'Competência', render: (i) => i.competence },
    { key: 'amount', header: 'Valor', align: 'right', render: (i) => money(i.amount) },
    { key: 'due', header: 'Vencimento', render: (i) => date(i.dueDate) },
    { key: 'status', header: 'Situação', render: (i) => <Status kind="saasInvoice" value={i.status === 'OPEN' && new Date(i.dueDate) < new Date() ? 'OVERDUE' : i.status} /> },
    { key: 'notes', header: 'Observação', render: (i) => <span className="small muted">{i.notes ?? ''}</span> },
    { key: 'actions', header: '', render: (i) => (i.status === 'OPEN' || i.status === 'OVERDUE') && (
      <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={() => act(i, 'void')}>Cancelar</Button><Button size="sm" variant="primary" onClick={() => act(i, 'pay')}>Dar baixa</Button></div>
    ) },
  ];
  return (
    <Page>
      <PageHeader title="Assinaturas e faturas do SaaS" description="Financeiro da Norty, separado do financeiro das locadoras. Nenhuma cobrança é emitida automaticamente: a fatura registra o valor devido e a baixa é manual, com referência." />
      <Card title="Gerar faturas da competência" subtitle="Uma por empresa com assinatura ativa ou em atraso e preço maior que zero.">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Competência"><Input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} /></Field>
          <Field label="Dia de vencimento"><Input type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} /></Field>
          <Button variant="primary" icon={FileClock} onClick={generate}>Gerar</Button>
        </div>
      </Card>
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} empty={{ title: 'Nenhuma fatura', icon: FileClock }}
          toolbar={<select className="nc-select" style={{ width: 200 }} value={status} aria-label="Situação" onChange={(e) => { setParams(e.target.value ? { status: e.target.value } : {}); setPage(1); }}>
            <option value="">Todas</option><option value="OPEN">Em aberto</option><option value="OVERDUE">Vencidas</option><option value="PAID">Pagas</option><option value="VOID">Canceladas</option>
          </select>}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
    </Page>
  );
}

/* ================= Domínios ================= */

interface DomainAll { id: string; hostname: string; kind: string; status: string; lastCheckedAt: string | null; lastCheckError: string | null; createdAt: string; organization: { id: string; name: string; slug: string } }

export function MasterDomainsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const list = useApi(() => api.get<DomainAll[]>('/platform/domains', { status }), [status]);
  return (
    <Page>
      <PageHeader title="Domínios" description="Subdomínios Norty e domínios próprios de todas as empresas. Um domínio só serve a empresa que provou a propriedade." />
      <Card flush>
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={{ title: 'Nenhum domínio', icon: Globe }}
          toolbar={<select className="nc-select" style={{ width: 240 }} value={status} aria-label="Situação" onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
            <option value="">Todas as situações</option><option value="PENDING_VERIFICATION">Aguardando verificação</option><option value="VERIFIED">Propriedade verificada</option><option value="ACTIVE">Ativos</option><option value="MISCONFIGURED">Configuração incorreta</option>
          </select>}
          columns={[
            { key: 'host', header: 'Domínio', render: (d) => <div><div className="mono">{d.hostname}</div><div className="xsmall muted">{d.kind === 'SUBDOMAIN' ? 'Subdomínio Norty' : 'Domínio próprio'}</div></div> },
            { key: 'org', header: 'Empresa', render: (d) => <Link to={`/master/empresas/${d.organization.id}`}>{d.organization.name}</Link> },
            { key: 'status', header: 'Situação', render: (d) => <div><Status kind="domain" value={d.status} />{d.lastCheckError && <div className="xsmall text-danger">{d.lastCheckError}</div>}</div> },
            { key: 'checked', header: 'Última verificação', render: (d) => d.lastCheckedAt ? relative(d.lastCheckedAt) : '—' },
            { key: 'actions', header: '', render: (d) => (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {d.kind === 'CUSTOM' && <Button size="sm" icon={RefreshCw} onClick={() => api.post(`/platform/domains/${d.id}/verify`).then(() => { toast.success('Verificação concluída'); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Verificar</Button>}
                <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remover" onClick={async () => {
                  const r = await confirm({ title: 'Remover domínio', message: `${d.hostname} deixa de servir o site de ${d.organization.name} e fica livre.`, requireReason: true, confirmLabel: 'Remover' });
                  if (r.confirmed) api.del(`/platform/domains/${d.id}`, { reason: r.reason }).then(() => { toast.success('Domínio removido'); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
                }} />
              </div>
            ) },
          ]} />
      </Card>
    </Page>
  );
}

/* ================= Suporte ================= */

interface Ticket { id: string; subject: string; description: string; status: string; createdAt: string; updatedAt: string; organization: { id: string; name: string }; messages: { id: string; body: string; fromNorty: boolean; createdAt: string }[] }
interface MyGrant { id: string; purpose: string; status: string; scope: string[]; durationHours: number; createdAt: string; expiresAt: string | null; organization: { id: string; name: string } }

export function MasterSupportPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'tickets' | 'grants'>('tickets');
  const [status, setStatus] = useState('');
  const tickets = useApi(() => api.get<Ticket[]>('/platform/tickets', { status }), [status]);
  const grants = useApi(() => api.get<MyGrant[]>('/platform/support-grants'), []);
  const [open, setOpen] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [next, setNext] = useState('');
  const send = () => open && api.patch(`/platform/tickets/${open.id}`, { message: reply || undefined, status: next || undefined })
    .then(() => { toast.success('Chamado atualizado'); setReply(''); setNext(''); setOpen(null); tickets.reload(); }).catch((e) => toast.error(errorMessage(e)));
  return (
    <Page>
      <PageHeader title="Suporte" description="Chamados das empresas e seus pedidos de acesso excepcional. O pedido de acesso é feito na ficha da empresa." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'tickets', label: 'Chamados' }, { value: 'grants', label: 'Meus pedidos de acesso', count: grants.data?.length }]} />
      {tab === 'tickets' ? (
        <Card flush>
          <DataTable rows={tickets.data} loading={tickets.loading} error={tickets.error} onRetry={tickets.reload} onRowClick={setOpen} empty={{ title: 'Nenhum chamado' }}
            toolbar={<select className="nc-select" style={{ width: 220 }} value={status} aria-label="Situação" onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>{Object.entries(SUPPORT_TICKET_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>}
            columns={[
              { key: 'org', header: 'Empresa', render: (t) => t.organization.name },
              { key: 'subject', header: 'Assunto', render: (t) => <span className="strong">{t.subject}</span> },
              { key: 'updated', header: 'Atualizado', render: (t) => relative(t.updatedAt) },
              { key: 'status', header: 'Situação', render: (t) => <Status kind="ticket" value={t.status} /> },
            ]} />
        </Card>
      ) : (
        <Card flush>
          <DataTable rows={grants.data} loading={grants.loading} error={grants.error} empty={{ title: 'Nenhum pedido de acesso' }} columns={[
            { key: 'org', header: 'Empresa', render: (g) => <Link to={`/master/empresas/${g.organization.id}`}>{g.organization.name}</Link> },
            { key: 'purpose', header: 'Finalidade', render: (g) => g.purpose },
            { key: 'scope', header: 'Escopo', render: (g) => <span className="small">{g.scope.length} permissão(ões) de leitura · {g.durationHours} h</span> },
            { key: 'exp', header: 'Válido até', render: (g) => dateTime(g.expiresAt) },
            { key: 'status', header: 'Situação', render: (g) => <Status kind="grant" value={g.status} /> },
          ]} />
          {grants.data?.some((g) => g.status === 'APPROVED') && <div className="nc-card__body"><Alert tone="info">Acessos autorizados aparecem em "Trocar empresa ou contexto", no menu do perfil.</Alert></div>}
        </Card>
      )}
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} wide title={open?.subject ?? ''} description={open ? `${open.organization.name} · aberto em ${dateTime(open.createdAt)}` : ''}
        footer={<>
          <select className="nc-select" style={{ width: 200 }} value={next} onChange={(e) => setNext(e.target.value)} aria-label="Nova situação">
            <option value="">Manter situação</option>{Object.entries(SUPPORT_TICKET_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Button variant="primary" icon={Send} disabled={!reply.trim() && !next} onClick={send}>Enviar</Button>
        </>}>
        {open && (
          <div className="stack">
            <div className="nc-card" style={{ padding: 12, whiteSpace: 'pre-wrap' }}>{open.description}</div>
            {open.messages.map((m) => (
              <div key={m.id} className="nc-card" style={{ padding: 12, background: m.fromNorty ? 'var(--brand-softer)' : undefined }}>
                <div className="xsmall muted">{m.fromNorty ? 'Equipe Norty' : open.organization.name} · {dateTime(m.createdAt)}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
              </div>
            ))}
            <Field label="Resposta"><Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} /></Field>
          </div>
        )}
      </Drawer>
    </Page>
  );
}

/* ================= Saúde ================= */

interface Health { status: string; version: string; nodeEnv: string; uptimeSeconds: number; memoryMb: number; database: { ok: boolean; latencyMs: number }; storage: { ok: boolean; driver: string }; jobs: { enabled: boolean; intervalSeconds: number }; queue: { pending: number; failed: number; skippedNotConfigured: number; sent: number; failedInboundWebhooks: number; lastNotificationAt: string | null; activeSessions: number }; checkedAt: string }

export function HealthPage() {
  const h = useApi(() => api.get<Health>('/platform/health'), []);
  useEffect(() => { const t = setInterval(h.reload, 30_000); return () => clearInterval(t); }, [h.reload]);
  if (h.loading && !h.data) return <LoadingBlock />;
  if (h.error || !h.data) return <ErrorState message={h.error ?? 'Sem dados'} onRetry={h.reload} />;
  const d = h.data;
  return (
    <Page>
      <PageHeader title="Saúde da plataforma" description={`Atualizado ${relative(d.checkedAt)}. Atualiza sozinho a cada 30 segundos.`} actions={<Button icon={RefreshCw} onClick={h.reload}>Atualizar</Button>} />
      <div className="grid-4">
        <StatCard label="Situação geral" value={d.status === 'ok' ? 'Operando' : 'Degradada'} icon={Activity} tone={d.status === 'ok' ? 'success' : 'danger'} foot={`Versão ${d.version} · ${d.nodeEnv}`} size="md" />
        <StatCard label="Banco de dados" value={d.database.ok ? `${d.database.latencyMs} ms` : 'Fora do ar'} icon={Activity} tone={d.database.ok ? 'success' : 'danger'} size="md" />
        <StatCard label="Armazenamento" value={d.storage.ok ? 'Disponível' : 'Indisponível'} icon={Activity} tone={d.storage.ok ? 'success' : 'danger'} foot={`Driver ${d.storage.driver}`} size="md" />
        <StatCard label="Sessões ativas" value={int(d.queue.activeSessions)} icon={Activity} foot={`Processo há ${Math.round(d.uptimeSeconds / 3600)} h · ${d.memoryMb} MB`} size="md" />
      </div>
      <Card title="Filas e rotinas">
        <KeyValue items={[
          { label: 'Rotinas agendadas', value: d.jobs.enabled ? `Ligadas, a cada ${Math.round(d.jobs.intervalSeconds / 60)} min` : 'Desligadas' },
          { label: 'Última notificação gerada', value: d.queue.lastNotificationAt ? dateTime(d.queue.lastNotificationAt) : 'Nenhuma ainda' },
          { label: 'Entregas pendentes', value: int(d.queue.pending) },
          { label: 'Entregas com falha', value: <span className={d.queue.failed ? 'text-danger' : undefined}>{int(d.queue.failed)}</span> },
          { label: 'Puladas (canal não configurado)', value: int(d.queue.skippedNotConfigured) },
          { label: 'Entregues', value: int(d.queue.sent) },
          { label: 'Webhooks recebidos com erro', value: <span className={d.queue.failedInboundWebhooks ? 'text-danger' : undefined}>{int(d.queue.failedInboundWebhooks)}</span> },
        ]} />
      </Card>
    </Page>
  );
}

/* ================= Auditoria administrativa ================= */

export function MasterAuditPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const list = useApi(() => api.get<Paginated<AuditEntry>>('/platform/audit', { q: term, page, pageSize: 50 }), [term, page]);
  return (
    <Page>
      <PageHeader title="Auditoria administrativa" description="Ações da equipe Norty na plataforma. Ações dentro de uma empresa (inclusive de suporte) ficam também na trilha dela." />
      <Card flush>
        <DataTable rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setOpen} empty={{ title: 'Sem registros' }}
          toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Ação, pessoa ou entidade" />}
          columns={[
            { key: 'at', header: 'Quando', render: (e) => <span className="small nowrap">{dateTime(e.at)}</span> },
            { key: 'who', header: 'Quem', render: (e) => e.actorName ?? '—' },
            { key: 'action', header: 'Ação', render: (e) => <span className="mono small">{e.action}</span> },
            { key: 'entity', header: 'Registro', render: (e) => <span className="small">{e.entityType}</span> },
            { key: 'reason', header: 'Motivo', render: (e) => <span className="small muted">{e.reason ?? ''}</span> },
          ]}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.action ?? ''} description={open ? dateTime(open.at) : ''} wide>
        {open && <pre className="mono small" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ before: open.before, after: open.after, ip: open.ip, entityId: open.entityId }, null, 2)}</pre>}
      </Drawer>
    </Page>
  );
}

/* ================= Equipe Norty ================= */

export function StaffPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { session } = useSession();
  const list = useApi(() => api.get<StaffMember[]>('/platform/staff'), []);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', email: '', platformRole: 'SUPPORT' });
  const roles = (['SUPPORT', 'ADMIN', 'SUPER'] as const).filter((r) => r !== 'SUPER' || session?.user.platformRole === 'SUPER');
  return (
    <Page>
      <PageHeader title="Equipe Norty" description="Quem administra a plataforma. A verificação em duas etapas é obrigatória para entrar no Master." actions={<Button variant="primary" icon={UserPlus} onClick={() => setCreating(true)}>Adicionar</Button>} />
      {link && <Alert tone="warning" title="Entregue este link à pessoa" action={<Button size="sm" icon={Copy} onClick={() => navigator.clipboard.writeText(link)}>Copiar</Button>}><div className="mono small" style={{ wordBreak: 'break-all' }}>{link}</div></Alert>}
      <Card flush>
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} columns={[
          { key: 'name', header: 'Pessoa', render: (s) => <div><div className="strong">{s.name}</div><div className="xsmall muted">{s.email}</div></div> },
          { key: 'role', header: 'Papel', render: (s) => PLATFORM_ROLE_LABEL[s.platformRole] },
          { key: 'mfa', header: 'MFA', render: (s) => s.mfaEnabled ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Pendente</Badge> },
          { key: 'last', header: 'Último acesso', render: (s) => dateTime(s.lastLoginAt) },
          { key: 'status', header: 'Situação', render: (s) => s.active ? <Badge tone="success" dot>Ativo</Badge> : <Badge dot>Inativo</Badge> },
          { key: 'actions', header: '', render: (s) => s.id !== session?.user.id && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <select className="nc-select" style={{ width: 170 }} value={s.platformRole} aria-label="Papel" onChange={(e) => api.patch(`/platform/staff/${s.id}`, { platformRole: e.target.value }).then(() => { toast.success('Papel alterado'); list.reload(); }).catch((err) => toast.error(errorMessage(err)))}>
                {[...roles, 'NONE' as const].map((r) => <option key={r} value={r}>{PLATFORM_ROLE_LABEL[r]}</option>)}
              </select>
              <Button size="sm" onClick={async () => {
                const r = await confirm({ title: s.active ? 'Desativar acesso' : 'Reativar acesso', message: s.active ? 'As sessões do Master e de suporte são encerradas na hora.' : 'A pessoa volta a poder entrar.', confirmLabel: s.active ? 'Desativar' : 'Reativar', tone: s.active ? 'danger' : 'primary' });
                if (r.confirmed) api.patch(`/platform/staff/${s.id}`, { active: !s.active }).then(() => list.reload()).catch((err) => toast.error(errorMessage(err)));
              }}>{s.active ? 'Desativar' : 'Reativar'}</Button>
            </div>
          ) },
        ]} />
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Adicionar à equipe Norty" footer={<><Button onClick={() => setCreating(false)}>Cancelar</Button><Button variant="primary" disabled={!f.name || !f.email} onClick={() => api.post<AccessLinkResult>('/platform/staff', f).then((r) => { toast.success('Pessoa adicionada'); setCreating(false); setF({ name: '', email: '', platformRole: 'SUPPORT' }); if (r.accessLink) setLink(r.accessLink); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Adicionar</Button></>}>
        <div className="stack">
          <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="E-mail" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Papel" required><Select value={f.platformRole} onChange={(e) => setF({ ...f, platformRole: e.target.value })} options={roles.map((r) => ({ value: r, label: PLATFORM_ROLE_LABEL[r] }))} /></Field>
        </div>
      </Modal>
    </Page>
  );
}

/* ================= Integrações globais ================= */

export function MasterIntegrationsPage() {
  const [test, setTest] = useState(false);
  const list = useApi(() => api.get<IntegrationHealth[]>('/platform/integrations', { test: test ? 'true' : undefined }), [test]);
  return (
    <Page>
      <PageHeader title="Integrações globais" description="Situação real de cada integração. 'Verificada' só aparece depois de comunicação bem-sucedida." actions={<Button icon={ShieldCheck} loading={list.loading && test} onClick={() => { setTest(true); list.reload(); }}>Testar comunicação</Button>} />
      <Card flush>
        <DataTable rows={list.data?.map((i) => ({ ...i, id: i.provider }))} loading={list.loading} error={list.error} onRetry={list.reload} columns={[
          { key: 'name', header: 'Integração', render: (i) => <span className="strong">{i.name}</span> },
          { key: 'status', header: 'Situação', render: (i) => <Status kind="integration" value={i.status} /> },
          { key: 'detail', header: 'Detalhe', render: (i) => <span className="small muted">{i.detail}</span> },
        ]} />
      </Card>
      <Alert tone="neutral">As credenciais globais são variáveis de ambiente do servidor (ver docs/norty-car/API.md e o .env.example da API) — nunca ficam no navegador nem no repositório.</Alert>
    </Page>
  );
}

/* ================= Configurações globais ================= */

export function MasterSettingsPage() {
  const toast = useToast();
  const settings = useApi(() => api.get<Record<string, unknown>>('/platform/settings'), []);
  const [trialDays, setTrialDays] = useState<number | ''>('');
  useEffect(() => { if (settings.data) setTrialDays(Number(settings.data.trialDays ?? 14)); }, [settings.data]);
  if (settings.loading && !settings.data) return <LoadingBlock />;
  return (
    <Page>
      <PageHeader title="Configurações globais" description="Padrões aplicados a todas as empresas novas." />
      <Card title="Avaliação" actions={<Button size="sm" variant="primary" icon={Save} onClick={() => api.put('/platform/settings', { key: 'trialDays', value: Number(trialDays) }).then(() => toast.success('Configuração salva')).catch((e) => toast.error(errorMessage(e)))}>Salvar</Button>}>
        <Field label="Dias de avaliação padrão para empresas novas" hint="Usado quando o cadastro não informa outro valor (0 a 90).">
          <Input type="number" min={0} max={90} value={trialDays} onChange={(e) => setTrialDays(e.target.value === '' ? '' : Number(e.target.value))} />
        </Field>
      </Card>
    </Page>
  );
}
