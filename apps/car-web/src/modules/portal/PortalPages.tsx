/* =========================================================
   Portal do cliente — pensado primeiro para o celular.
   Tudo o que aparece aqui foi filtrado no servidor pelo
   cadastro do cliente logado.
   ========================================================= */
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Bell, Car, ChevronRight, ClipboardCheck, Download, FileText, FolderOpen, Landmark, MessageSquarePlus, ReceiptText, Send, TriangleAlert, Wrench,
} from 'lucide-react';
import {
  CONTRACT_KIND_LABEL, INFRACTION_ADMIN_STATUS_LABEL, INFRACTION_FINANCIAL_STATUS_LABEL, INSPECTION_ITEM_STATUS_LABEL, INSPECTION_TYPE_LABEL,
  SERVICE_REQUEST_TYPE_LABEL, VEHICLE_REGIONS, type PortalContractRow, type PortalDeposit, type PortalInfraction, type PortalInspection,
  type PortalOverview, type PortalTitle, type ServiceRequestRow, type ServiceRequestType,
} from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, StatCard } from '../../components/ui';
import { Field, Input, Select, Textarea } from '../../components/form';
import { Modal } from '../../components/overlay';
import { Status } from '../../components/status';
import { SecureImage, downloadFile } from '../../components/files';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { bytes, date, dateTime, km, money, relative } from '../../lib/format';
import { useSession } from '../../lib/session';
import './portal.css';

async function openReceipt(paymentId: string) {
  const { blob } = await api.download(`/portal/payments/${paymentId}/receipt`);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ---------------- Início ---------------- */

export function PortalHome() {
  const { session } = useSession();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.get<PortalOverview>('/portal/overview'), []);
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? 'Sem dados'} onRetry={reload} />;
  const first = session?.user.name.split(' ')[0];
  return (
    <Page>
      <PageHeader eyebrow={session?.context.organizationName} title={`Olá, ${first}`} description="Seus contratos, pagamentos e solicitações em um só lugar." />
      {data.overdue.length > 0 && (
        <Alert tone="danger" title={`${data.overdue.length} pagamento(s) em atraso`} action={<Button size="sm" onClick={() => navigate('/cliente/financeiro')}>Ver</Button>}>
          Total em aberto: {money(data.overdue.reduce((a, t) => a + t.balance, 0))}. Em caso de dúvida, abra uma solicitação.
        </Alert>
      )}
      {data.activeContracts.length ? data.activeContracts.map((c) => (
        <Link key={c.id} to={`/cliente/contratos/${c.id}`} className="portal-hero">
          <span className="portal-hero__icon" aria-hidden><Car /></span>
          <span className="grow">
            <span className="xsmall muted">{CONTRACT_KIND_LABEL[c.kind]} · {c.number}</span>
            <strong>{c.vehicle ? c.vehicle.model : 'Veículo a definir'}</strong>
            <span className="small muted">{c.vehicle ? `${c.vehicle.plate} · ${c.vehicle.color} · ` : ''}até {date(c.endAt)}</span>
          </span>
          <ChevronRight aria-hidden />
        </Link>
      )) : <Card><EmptyState icon={Car} title="Nenhum contrato em vigor" description="Quando você retirar um veículo, ele aparece aqui." /></Card>}
      <div className="grid-3">
        <StatCard label="Próximo vencimento" value={data.upcoming[0] ? money(data.upcoming[0].balance) : '—'} icon={ReceiptText} foot={data.upcoming[0] ? `${date(data.upcoming[0].dueDate)} · ${data.upcoming[0].description}` : 'Nada a vencer'} onClick={() => navigate('/cliente/financeiro')} size="md" />
        <StatCard label="Solicitações em andamento" value={data.openRequests} icon={MessageSquarePlus} onClick={() => navigate('/cliente/solicitacoes')} size="md" />
        <StatCard label="Precisa de ajuda?" value="Assistência" icon={Wrench} foot="Abra uma solicitação de assistência" onClick={() => navigate('/cliente/solicitacoes?novo=ASSISTANCE')} size="md" />
      </div>
      <div className="portal-links">
        <Link to="/cliente/vistorias"><ClipboardCheck aria-hidden /> Vistorias</Link>
        <Link to="/cliente/multas"><TriangleAlert aria-hidden /> Multas</Link>
        <Link to="/cliente/documentos"><FolderOpen aria-hidden /> Documentos</Link>
        <Link to="/cliente/notificacoes"><Bell aria-hidden /> Notificações</Link>
      </div>
    </Page>
  );
}

/* ---------------- Contratos ---------------- */

export function PortalContracts() {
  const { data, loading, error, reload } = useApi(() => api.get<PortalContractRow[]>('/portal/contracts'), []);
  return (
    <Page>
      <PageHeader title="Meus contratos" />
      {loading && !data ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <Card><EmptyState icon={FileText} title="Nenhum contrato" /></Card>
      ) : (
        <div className="portal-list">
          {data.map((c) => (
            <Link key={c.id} to={`/cliente/contratos/${c.id}`} className="portal-item">
              <span className="grow">
                <span className="row-between"><strong>{c.number}</strong><Status kind="contract" value={c.status} /></span>
                <span className="small muted">{CONTRACT_KIND_LABEL[c.kind]}{c.vehicle ? ` · ${c.vehicle.model} · ${c.vehicle.plate}` : ''}</span>
                <span className="small">{date(c.startAt)} a {date(c.endAt)}{c.monthlyAmount ? ` · ${money(c.monthlyAmount)}/mês` : c.totalAmount ? ` · ${money(c.totalAmount)}` : ''}</span>
              </span>
              <ChevronRight aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

interface PortalContractDetail {
  id: string; number: string; kind: 'PERIOD' | 'LONG_TERM'; status: string; startAt: string; endAt: string; actualStartAt: string | null; actualEndAt: string | null;
  totalAmount: number | null; monthlyAmount: number | null; termMonths: number | null; billingDay: number | null; kmAllowance: number | null; kmAllowancePeriod: string | null;
  extraKmRate: number | null; lateFeePercent: number; monthlyInterestPercent: number; includedServices: string[]; terms: string | null; signatureStatus: string;
  vehicles: { plate: string; model: string; color: string; startAt: string; endAt: string | null; current: boolean }[];
  drivers: { name: string; primary: boolean; startAt: string; endAt: string | null }[];
  extras: { name: string; pricing: string; price: number; quantity: number }[];
  deposit: (PortalDeposit & { expected: number }) | null;
  documents: { id: string; name: string; mimeType: string; size: number; category: string | null; createdAt: string }[];
}

export function PortalContractDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: c, loading, error, reload } = useApi(() => api.get<PortalContractDetail>(`/portal/contracts/${id}`), [id]);
  if (loading && !c) return <LoadingBlock />;
  if (error || !c) return <ErrorState message={error ?? 'Contrato não encontrado'} onRetry={reload} />;
  const current = c.vehicles.find((v) => v.current) ?? c.vehicles[c.vehicles.length - 1];
  const ask = (type: ServiceRequestType) => navigate(`/cliente/solicitacoes?novo=${type}&contrato=${c.id}`);
  return (
    <Page>
      <PageHeader breadcrumb={<Link to="/cliente/contratos">Contratos</Link>} title={`Contrato ${c.number}`} description={<span className="row"><Status kind="contract" value={c.status} /> {CONTRACT_KIND_LABEL[c.kind]}</span>} />
      {current && (
        <Card title={current.model} subtitle={`${current.plate} · ${current.color}`}>
          <KeyValue items={[
            { label: 'Vigência', value: `${date(c.startAt)} a ${date(c.endAt)}` },
            { label: c.kind === 'LONG_TERM' ? 'Mensalidade' : 'Valor', value: money(c.monthlyAmount ?? c.totalAmount) },
            { label: 'Vencimento', value: c.billingDay ? `Todo dia ${c.billingDay}` : null, hidden: !c.billingDay },
            { label: 'Quilometragem', value: c.kmAllowance ? `${km(c.kmAllowance)}${c.kmAllowancePeriod === 'MONTH' ? ' por mês' : ''}` : 'Livre' },
            { label: 'Km adicional', value: money(c.extraKmRate), hidden: !c.extraKmRate },
            { label: 'Multa e juros por atraso', value: `${c.lateFeePercent}% + ${c.monthlyInterestPercent}% ao mês` },
          ]} />
        </Card>
      )}
      {c.status === 'ACTIVE' && (
        <div className="portal-actions">
          <Button icon={Wrench} onClick={() => ask('MAINTENANCE')}>Pedir manutenção</Button>
          <Button onClick={() => ask('ASSISTANCE')}>Assistência</Button>
          <Button onClick={() => ask('VEHICLE_SWAP')}>Trocar veículo</Button>
          {c.kind === 'LONG_TERM' && <Button onClick={() => ask('RENEWAL')}>Renovar</Button>}
          <Button variant="ghost" onClick={() => ask('TERMINATION')}>Encerrar contrato</Button>
        </div>
      )}
      {c.deposit && (
        <Card title="Caução" actions={<Status kind="deposit" value={c.deposit.status} />}>
          <KeyValue items={[
            { label: 'Previsto', value: money(c.deposit.expected) }, { label: 'Recebido', value: money(c.deposit.received) },
            { label: 'Utilizado', value: money(c.deposit.used) }, { label: 'Devolvido', value: money(c.deposit.refunded) }, { label: 'Saldo', value: <strong>{money(c.deposit.available)}</strong> },
          ]} />
        </Card>
      )}
      <div className="grid-2">
        <Card title="Veículos no contrato" flush>
          <ul className="nc-list">{c.vehicles.map((v) => <li key={v.plate + v.startAt}><div className="grow"><div className="strong">{v.model} · {v.plate}</div><div className="xsmall muted">{date(v.startAt)} {v.endAt ? `a ${date(v.endAt)}` : '— atual'}</div></div>{v.current && <Badge tone="brand">Atual</Badge>}</li>)}</ul>
        </Card>
        <Card title="Motoristas" flush>
          <ul className="nc-list">{c.drivers.map((d) => <li key={d.name + d.startAt}><div className="grow"><div className="strong">{d.name}</div><div className="xsmall muted">{d.primary ? 'Principal' : 'Adicional'} · desde {date(d.startAt)}{d.endAt ? ` até ${date(d.endAt)}` : ''}</div></div></li>)}</ul>
        </Card>
      </div>
      {(c.extras.length > 0 || c.includedServices.length > 0) && (
        <Card title="Serviços">
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {c.includedServices.map((s) => <li key={s}>{s} (incluído)</li>)}
            {c.extras.map((e) => <li key={e.name}>{e.name} — {money(e.price)}{e.pricing === 'PER_DAY' ? '/dia' : ''}</li>)}
          </ul>
        </Card>
      )}
      <Card title="Documentos" flush>
        {c.documents.length ? (
          <ul className="nc-list">{c.documents.map((f) => (
            <li key={f.id}><FileText size={18} className="muted" aria-hidden /><div className="grow"><div className="strong ellipsis">{f.name}</div><div className="xsmall muted">{bytes(f.size)} · {date(f.createdAt)}</div></div>
              <Button size="sm" variant="ghost" icon={Download} aria-label={`Baixar ${f.name}`} onClick={() => downloadFile(f).catch((e) => toast.error(errorMessage(e)))} /></li>
          ))}</ul>
        ) : <div className="nc-card__body small muted">A locadora ainda não liberou documentos deste contrato.</div>}
      </Card>
      {c.terms && <Card title="Condições do contrato"><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{c.terms}</div></Card>}
    </Page>
  );
}

/* ---------------- Financeiro ---------------- */

export function PortalFinance() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.get<{ titles: (PortalTitle & { contractNumber: string | null; payments: { id: string; amount: number; paidAt: string; method: string }[] })[]; deposits: (PortalDeposit & { contractNumber: string })[] }>('/portal/finance'), []);
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? 'Sem dados'} onRetry={reload} />;
  const open = data.titles.filter((t) => t.status === 'OPEN' || t.status === 'PARTIAL');
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Page>
      <PageHeader title="Financeiro" description="Mensalidades, cobranças e pagamentos confirmados pela locadora." />
      <div className="grid-3">
        <StatCard label="Em aberto" value={money(open.reduce((a, t) => a + t.balance, 0))} icon={ReceiptText} size="md" />
        <StatCard label="Em atraso" value={money(open.filter((t) => t.dueDate < today).reduce((a, t) => a + t.balance, 0))} icon={TriangleAlert} tone={open.some((t) => t.dueDate < today) ? 'danger' : undefined} size="md" />
        <StatCard label="Caução disponível" value={money(data.deposits.reduce((a, d) => a + d.available, 0))} icon={Landmark} size="md" />
      </div>
      <Alert tone="neutral">O pagamento é feito pelos meios combinados com a locadora. Aqui aparecem apenas pagamentos já confirmados por ela.</Alert>
      {!data.titles.length ? <Card><EmptyState icon={ReceiptText} title="Nenhuma cobrança" /></Card> : (
        <div className="portal-list">
          {data.titles.map((t) => (
            <div key={t.id} className="portal-item">
              <span className="grow">
                <span className="row-between"><strong>{t.description}</strong><Status kind="title" value={t.status} /></span>
                <span className="small muted">Vence em {date(t.dueDate)}{t.contractNumber ? ` · ${t.contractNumber}` : ''}{t.status !== 'PAID' && t.dueDate < today ? ' · em atraso' : ''}</span>
                <span className="row-between small"><span>Valor {money(t.amount)}</span>{t.balance > 0 && t.status !== 'CANCELLED' && <strong>Saldo {money(t.balance)}</strong>}</span>
                {t.payments.map((p) => (
                  <button key={p.id} type="button" className="portal-receipt" onClick={() => openReceipt(p.id).catch((e) => toast.error(errorMessage(e)))}>
                    <ReceiptText size={14} aria-hidden /> Pago {money(p.amount)} em {date(p.paidAt)} · ver recibo
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {data.deposits.length > 0 && (
        <Card title="Cauções" flush>
          <ul className="nc-list">{data.deposits.map((d) => <li key={d.contractNumber}><div className="grow"><div className="strong">{d.contractNumber}</div><div className="xsmall muted">Recebido {money(d.received)} · utilizado {money(d.used)} · devolvido {money(d.refunded)}</div></div><strong className="tnum">{money(d.available)}</strong></li>)}</ul>
        </Card>
      )}
    </Page>
  );
}

/* ---------------- Vistorias, multas e documentos ---------------- */

const REGION = Object.fromEntries(VEHICLE_REGIONS.map((r) => [r.key, r.label])) as Record<string, string>;

export function PortalInspections() {
  const { data, loading, error, reload } = useApi(() => api.get<PortalInspection[]>('/portal/inspections'), []);
  const [open, setOpen] = useState<PortalInspection | null>(null);
  return (
    <Page>
      <PageHeader title="Vistorias" description="Vistorias de entrega e devolução liberadas pela locadora." />
      {loading && !data ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <Card><EmptyState icon={ClipboardCheck} title="Nenhuma vistoria liberada" /></Card> : (
        <div className="portal-list">
          {data.map((i) => (
            <button key={i.id} type="button" className="portal-item" onClick={() => setOpen(i)}>
              <span className="grow">
                <span className="row-between"><strong>{INSPECTION_TYPE_LABEL[i.type]} · {i.plate}</strong><span className="small muted">{dateTime(i.completedAt)}</span></span>
                <span className="small muted">{i.number}{i.contractNumber ? ` · ${i.contractNumber}` : ''} · {km(i.odometerKm)} · combustível {i.fuelEighths ?? '—'}/8</span>
                <span className="small">{i.damages.length ? `${i.damages.length} avaria(s) registrada(s)` : 'Sem avarias registradas'} · {i.photos.length} foto(s)</span>
              </span>
              <ChevronRight aria-hidden />
            </button>
          ))}
        </div>
      )}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} size="lg" title={open ? `${INSPECTION_TYPE_LABEL[open.type]} · ${open.plate}` : ''} description={open ? `${open.number} · ${dateTime(open.completedAt)}` : ''}>
        {open && (
          <div className="stack">
            {open.items.length > 0 && <div className="stack-sm"><span className="nc-section-title">Itens com observação</span>{open.items.map((it) => <div key={it.label} className="small">{it.area} · {it.label}: <strong>{INSPECTION_ITEM_STATUS_LABEL[it.status as keyof typeof INSPECTION_ITEM_STATUS_LABEL] ?? it.status}</strong>{it.notes ? ` — ${it.notes}` : ''}</div>)}</div>}
            {open.damages.length > 0 && <div className="stack-sm"><span className="nc-section-title">Avarias</span>{open.damages.map((d, i) => <div key={i} className="small">{REGION[d.region] ?? d.region}: {d.description}</div>)}</div>}
            {open.notes && <div className="small"><strong>Observações:</strong> {open.notes}</div>}
            {open.photos.length > 0 && <div className="nc-thumbs">{open.photos.map((p) => <div key={p.fileId} className="nc-thumb"><SecureImage fileId={p.fileId} alt={p.caption ?? 'Foto da vistoria'} /></div>)}</div>}
          </div>
        )}
      </Modal>
    </Page>
  );
}

export function PortalInfractions() {
  const { data, loading, error, reload } = useApi(() => api.get<PortalInfraction[]>('/portal/infractions'), []);
  return (
    <Page>
      <PageHeader title="Multas" description="Infrações de trânsito registradas pela locadora no seu cadastro." />
      {loading && !data ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <Card><EmptyState icon={TriangleAlert} title="Nenhuma multa registrada" /></Card> : (
        <div className="portal-list">
          {data.map((i) => (
            <div key={i.id} className="portal-item">
              <span className="grow">
                <span className="row-between"><strong>{i.description}</strong><strong className="tnum">{money(i.finalAmount)}</strong></span>
                <span className="small muted">{dateTime(i.occurredAt)} · {i.plate}{i.location ? ` · ${i.location}` : ''}</span>
                <span className="small muted">{i.authority} · auto {i.autoNumber}{i.driverName ? ` · condutor ${i.driverName}` : ''}</span>
                <span className="row" style={{ gap: 6 }}>
                  <Badge tone="info">{INFRACTION_ADMIN_STATUS_LABEL[i.adminStatus]}</Badge>
                  <Badge>{INFRACTION_FINANCIAL_STATUS_LABEL[i.financialStatus]}</Badge>
                  {i.driverIndicationDeadline && <Badge tone="warning">Indicação até {date(i.driverIndicationDeadline)}</Badge>}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

export function PortalDocuments() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.get<{ id: string; name: string; mimeType: string; size: number; createdAt: string; reference: string }[]>('/portal/documents'), []);
  return (
    <Page>
      <PageHeader title="Documentos" description="Contratos, vistorias e comprovantes liberados pela locadora." />
      {loading && !data ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <Card><EmptyState icon={FolderOpen} title="Nenhum documento liberado" /></Card> : (
        <Card flush>
          <ul className="nc-list">{data.map((f) => (
            <li key={f.id}><FileText size={18} className="muted" aria-hidden /><div className="grow"><div className="strong ellipsis">{f.name}</div><div className="xsmall muted">{f.reference} · {bytes(f.size)} · {date(f.createdAt)}</div></div>
              <Button size="sm" variant="ghost" icon={Download} aria-label={`Baixar ${f.name}`} onClick={() => downloadFile(f).catch((e) => toast.error(errorMessage(e)))} /></li>
          ))}</ul>
        </Card>
      )}
    </Page>
  );
}

/* ---------------- Solicitações ---------------- */

const CUSTOMER_TYPES: ServiceRequestType[] = ['MAINTENANCE', 'ASSISTANCE', 'VEHICLE_SWAP', 'RENEWAL', 'TERMINATION', 'DATA_ACCESS', 'DATA_CORRECTION', 'OTHER'];

export function PortalRequests() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const list = useApi(() => api.get<ServiceRequestRow[]>('/portal/requests'), []);
  const contracts = useApi(() => api.get<PortalContractRow[]>('/portal/contracts'), []);
  const preset = params.get('novo') as ServiceRequestType | null;
  const [form, setForm] = useState<{ type: ServiceRequestType; subject: string; description: string; contractId: string } | null>(
    preset ? { type: preset, subject: SERVICE_REQUEST_TYPE_LABEL[preset] ?? '', description: '', contractId: params.get('contrato') ?? '' } : null,
  );
  const [openId, setOpenId] = useState<string | null>(params.get('id'));
  const [reply, setReply] = useState('');
  const open = list.data?.find((r) => r.id === openId) ?? null;
  const close = () => { setForm(null); setParams({}); };
  const submit = () => form && api.post('/portal/requests', { type: form.type, subject: form.subject, description: form.description, contractId: form.contractId || undefined })
    .then(() => { toast.success('Solicitação enviada', 'A locadora foi notificada.'); close(); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
  return (
    <Page>
      <PageHeader title="Solicitações" description="Manutenção, assistência, troca, renovação, encerramento e pedidos sobre seus dados pessoais (LGPD)."
        actions={<Button variant="primary" icon={MessageSquarePlus} onClick={() => setForm({ type: 'MAINTENANCE', subject: '', description: '', contractId: '' })}>Nova solicitação</Button>} />
      {list.loading && !list.data ? <LoadingBlock /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data?.length ? (
        <Card><EmptyState icon={MessageSquarePlus} title="Nenhuma solicitação" description="Precisa de algo? Abra uma solicitação e acompanhe a resposta por aqui." /></Card>
      ) : (
        <div className="portal-list">
          {list.data.map((r) => (
            <button key={r.id} type="button" className="portal-item" onClick={() => setOpenId(r.id)}>
              <span className="grow">
                <span className="row-between"><strong>{r.subject}</strong><Status kind="request" value={r.status} /></span>
                <span className="small muted">{SERVICE_REQUEST_TYPE_LABEL[r.type]} · atualizada {relative(r.updatedAt)} · {r.messages.length} mensagem(ns)</span>
              </span>
              <ChevronRight aria-hidden />
            </button>
          ))}
        </div>
      )}
      <Modal open={Boolean(form)} onClose={close} title="Nova solicitação" footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" icon={Send} disabled={!form || form.subject.trim().length < 3 || form.description.trim().length < 3} onClick={submit}>Enviar</Button></>}>
        {form && (
          <div className="stack">
            <Field label="Tipo" required><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ServiceRequestType })} options={CUSTOMER_TYPES.map((t) => ({ value: t, label: SERVICE_REQUEST_TYPE_LABEL[t] }))} /></Field>
            {(contracts.data?.length ?? 0) > 0 && <Field label="Contrato"><Select value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })} placeholder="Não se aplica" options={(contracts.data ?? []).map((c) => ({ value: c.id, label: `${c.number}${c.vehicle ? ` · ${c.vehicle.plate}` : ''}` }))} /></Field>}
            <Field label="Assunto" required><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={160} /></Field>
            <Field label="Descrição" required hint={form.type === 'ASSISTANCE' ? 'Em emergência na estrada, ligue também para a locadora.' : undefined}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} /></Field>
          </div>
        )}
      </Modal>
      <Modal open={Boolean(open)} onClose={() => { setOpenId(null); setParams({}); }} size="lg" title={open?.subject ?? ''} description={open ? `${SERVICE_REQUEST_TYPE_LABEL[open.type]} · aberta em ${dateTime(open.createdAt)}` : ''}
        footer={open && open.status !== 'CLOSED' ? <><Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Escreva uma mensagem…" /><Button variant="primary" icon={Send} disabled={!reply.trim()} onClick={() => api.post(`/portal/requests/${open.id}/messages`, { body: reply }).then(() => { setReply(''); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Enviar</Button></> : undefined}>
        {open && (
          <div className="stack">
            <div className="portal-msg">{open.description}</div>
            {open.messages.map((m) => <div key={m.id} className="portal-msg" data-mine={m.fromCustomer || undefined}><div className="xsmall muted">{m.fromCustomer ? 'Você' : 'Locadora'} · {dateTime(m.createdAt)}</div>{m.body}</div>)}
            {open.status === 'CLOSED' && <Alert tone="neutral">Solicitação encerrada. Abra uma nova se precisar.</Alert>}
          </div>
        )}
      </Modal>
    </Page>
  );
}

/* ---------------- Notificações ---------------- */

interface NotificationItem { id: string; title: string; body: string; link?: string | null; severity?: string; createdAt: string; readAt?: string | null; read?: boolean }

export function PortalNotifications() {
  const navigate = useNavigate();
  const list = useApi(() => api.get<NotificationItem[] | { items: NotificationItem[] }>('/notifications', { pageSize: 50 }), []);
  const items = Array.isArray(list.data) ? list.data : list.data?.items ?? [];
  const read = (n: NotificationItem) => {
    void api.post(`/notifications/${n.id}/read`).catch(() => undefined);
    if (n.link?.startsWith('/cliente')) navigate(n.link);
    else list.reload();
  };
  return (
    <Page>
      <PageHeader title="Notificações" actions={items.length > 0 && <Button size="sm" onClick={() => api.post('/notifications/read-all').then(list.reload).catch(() => undefined)}>Marcar todas como lidas</Button>} />
      {list.loading && !list.data ? <LoadingBlock /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !items.length ? <Card><EmptyState icon={Bell} title="Nenhuma notificação" /></Card> : (
        <div className="portal-list">
          {items.map((n) => {
            const unread = !(n.read ?? n.readAt);
            return (
              <button key={n.id} type="button" className="portal-item" data-unread={unread || undefined} onClick={() => read(n)}>
                <span className="grow"><span className="row-between"><strong>{n.title}</strong><span className="xsmall muted">{relative(n.createdAt)}</span></span><span className="small muted">{n.body}</span></span>
              </button>
            );
          })}
        </div>
      )}
    </Page>
  );
}
