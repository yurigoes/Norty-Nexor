/* Ficha do cliente: dados, motoristas, contratos, financeiro, documentos e LGPD. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, Copy, Download, KeyRound, Pencil, Plus, ShieldOff, Unlock, UserPlus } from 'lucide-react';
import { CONTRACT_KIND_LABEL, DEPOSIT_STATUS_LABEL, PAYMENT_METHOD_LABEL, type PaymentMethod, type PersonType } from '@nortycar/shared';
import { Alert, Badge, Button, Card, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, StatCard, Tabs } from '../../components/ui';
import { Field, FormGrid, Input, Select } from '../../components/form';
import { DataTable } from '../../components/table';
import { Modal, useConfirm } from '../../components/overlay';
import { Status } from '../../components/status';
import { Attachments } from '../../components/files';
import { useToast } from '../../components/toast';
import { api, errorMessage, saveBlob } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, money } from '../../lib/format';
import { useSession } from '../../lib/session';
import { CustomerForm, type CustomerFormValue } from './CustomerForm';
import { CNH_OPTIONS, DriverForm, type DriverFormValue } from './DriverForm';

interface CustomerDetail extends CustomerFormValue {
  id: string; status: string; blockReason: string | null; anonymizedAt: string | null; createdAt: string; updatedAt: string;
  drivers: (DriverFormValue & { cnhDaysLeft: number })[];
  contracts: { id: string; number: string; kind: string; status: string; startAt: string; endAt: string; totalAmount: number | null; monthlyAmount: number | null }[];
  deposits: { id: string; status: string; expectedAmount: number; contractId: string }[];
  summary: { contracts: number; activeContracts: number; openReceivables: number; openBalance: number; overdueReceivables: number; deposits: number; infractions: number; portalAccess: boolean };
}

type Tab = 'data' | 'drivers' | 'contracts' | 'finance' | 'documents' | 'lgpd';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('data');
  const [editing, setEditing] = useState(false);
  const [driver, setDriver] = useState<DriverFormValue | 'new' | null>(null);
  const [asDriver, setAsDriver] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const c = useApi(() => api.get<CustomerDetail>(`/customers/${id}`), [id]);

  if (c.loading && !c.data) return <LoadingBlock />;
  if (c.error || !c.data) return <ErrorState message={c.error ?? 'Cliente não encontrado.'} onRetry={c.reload} />;
  const d = c.data;
  const anonymized = Boolean(d.anonymizedAt);

  const toggleBlock = async () => {
    const blocking = d.status !== 'BLOCKED';
    const r = await confirm({
      title: blocking ? 'Bloquear cliente' : 'Desbloquear cliente', requireReason: true, tone: blocking ? 'danger' : 'primary',
      message: blocking ? 'Cliente bloqueado não recebe novas reservas nem contratos.' : 'O cliente volta a poder reservar e contratar.',
      confirmLabel: blocking ? 'Bloquear' : 'Desbloquear',
    });
    if (!r.confirmed) return;
    api.post(`/customers/${id}/${blocking ? 'block' : 'unblock'}`, { reason: r.reason })
      .then(() => { toast.success(blocking ? 'Cliente bloqueado' : 'Cliente desbloqueado'); c.reload(); }).catch((e) => toast.error(errorMessage(e)));
  };

  const portal = async () => {
    if (!d.email) { toast.error('Cadastre o e-mail do cliente antes de liberar o portal.'); return; }
    try {
      const r = await api.post<{ accessLink: string | null; emailStatus: string; isNewUser: boolean }>(`/portal-access/customers/${id}`);
      if (r.accessLink) setPortalLink(r.accessLink);
      toast.success('Acesso ao portal liberado', r.emailStatus === 'SENT' ? 'O convite foi enviado por e-mail.' : r.accessLink ? 'Copie o link exibido e entregue ao cliente.' : 'A conta já existia e recebeu o vínculo.');
      c.reload();
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <Page>
      <PageHeader breadcrumb={<><Link to="/pessoas/clientes">Clientes</Link><span>/</span><span>{d.name}</span></>}
        title={<span className="row">{d.name} <Badge>{d.type}</Badge> <Status kind="customer" value={d.status} /></span>}
        description={`${d.document} · cliente desde ${date(d.createdAt)}`}
        actions={!anonymized && <>
          {can('portal.manage') && <Button icon={KeyRound} onClick={portal}>{d.summary.portalAccess ? 'Reenviar acesso ao portal' : 'Acesso ao portal'}</Button>}
          {can('customers.block') && <Button icon={d.status === 'BLOCKED' ? Unlock : Ban} onClick={toggleBlock}>{d.status === 'BLOCKED' ? 'Desbloquear' : 'Bloquear'}</Button>}
          {can('customers.edit') && <Button icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>}
        </>} />
      {anonymized && <Alert tone="neutral" title="Cadastro anonimizado">Os dados pessoais foram removidos em {date(d.anonymizedAt)}. Contratos e títulos históricos permanecem, sem identificação.</Alert>}
      {d.status === 'BLOCKED' && <Alert tone="danger" title="Cliente bloqueado">{d.blockReason ?? 'Sem motivo registrado.'}</Alert>}
      {portalLink && (
        <Alert tone="warning" title="Entregue este link ao cliente" action={<Button size="sm" icon={Copy} onClick={() => navigator.clipboard.writeText(portalLink).then(() => toast.success('Link copiado'))}>Copiar</Button>}>
          O envio de e-mail não está configurado. O link permite definir a senha do portal e não será exibido de novo:
          <div className="mono small" style={{ wordBreak: 'break-all', marginTop: 6 }}>{portalLink}</div>
        </Alert>
      )}
      <div className="grid-4">
        <StatCard label="Contratos ativos" value={d.summary.activeContracts} foot={`${d.summary.contracts} no total`} />
        <StatCard label="Saldo em aberto" value={money(d.summary.openBalance)} tone={d.summary.overdueReceivables ? 'danger' : undefined} size="md"
          foot={d.summary.overdueReceivables ? `${d.summary.overdueReceivables} título(s) vencido(s)` : `${d.summary.openReceivables} título(s) em aberto`} />
        <StatCard label="Cauções" value={d.summary.deposits} />
        <StatCard label="Infrações" value={d.summary.infractions} />
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'data', label: 'Dados' }, { value: 'drivers', label: 'Motoristas', count: d.drivers.length },
        { value: 'contracts', label: 'Contratos', count: d.contracts.length }, { value: 'finance', label: 'Financeiro' },
        { value: 'documents', label: 'Documentos', hidden: !can('customers.sensitive') }, { value: 'lgpd', label: 'LGPD', hidden: !can('customers.sensitive') && !can('customers.delete') },
      ]} />
      {tab === 'data' && (
        <Card>
          <KeyValue items={[
            { label: 'Nome fantasia', value: d.tradeName, hidden: d.type !== 'PJ' },
            { label: d.type === 'PF' ? 'Nascimento' : 'Abertura', value: d.birthDate ? date(d.birthDate) : can('customers.sensitive') ? '—' : 'Restrito' },
            { label: 'E-mail', value: d.email }, { label: 'Telefone', value: d.phone },
            { label: 'Endereço', value: [d.street, d.number, d.complement].filter(Boolean).join(', ') || null },
            { label: 'Bairro', value: d.district }, { label: 'Cidade', value: [d.city, d.state].filter(Boolean).join(' / ') || null }, { label: 'CEP', value: d.zip },
            { label: 'Pagamento preferido', value: d.preferredPayment ? PAYMENT_METHOD_LABEL[d.preferredPayment as PaymentMethod] : null },
            { label: 'Contato de emergência', value: d.emergencyContact ? `${d.emergencyContact.name} · ${d.emergencyContact.phone}${d.emergencyContact.relationship ? ` (${d.emergencyContact.relationship})` : ''}` : null },
            { label: 'Portal do cliente', value: d.summary.portalAccess ? <Badge tone="success">Liberado</Badge> : <Badge>Não liberado</Badge> },
          ]} />
          {d.internalNotes && <div className="stack-sm" style={{ marginTop: 'var(--space-4)' }}><span className="nc-section-title">Observações internas</span><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{d.internalNotes}</p></div>}
        </Card>
      )}
      {tab === 'drivers' && (
        <Card title="Motoristas vinculados" flush actions={!anonymized && can('customers.create') && <>
          {d.type === 'PF' && !d.drivers.some((x) => x.name === d.name) && <Button size="sm" icon={UserPlus} onClick={() => setAsDriver(true)}>O próprio cliente dirige</Button>}
          <Button size="sm" icon={Plus} onClick={() => setDriver('new')}>Novo motorista</Button>
        </>}>
          <DataTable rows={d.drivers} onRowClick={can('customers.edit') && !anonymized ? setDriver : undefined} empty={{ title: 'Nenhum motorista vinculado' }} columns={[
            { key: 'name', header: 'Nome', render: (x) => <span className="strong">{x.name}</span> },
            { key: 'cpf', header: 'CPF', render: (x) => <span className="mono small">{x.cpf}</span> },
            { key: 'cnh', header: 'CNH', render: (x) => `${x.cnhCategory} · ${x.cnhNumber}` },
            { key: 'exp', header: 'Validade', render: (x) => <CnhBadge date={x.cnhExpiresAt} days={x.cnhDaysLeft} /> },
            { key: 'active', header: 'Situação', render: (x) => (x.active ? <Badge tone="success" dot>Ativo</Badge> : <Badge dot>Inativo</Badge>) },
          ]} />
        </Card>
      )}
      {tab === 'contracts' && (
        <Card flush>
          <DataTable rows={d.contracts} empty={{ title: 'Nenhum contrato' }} onRowClick={(x) => window.location.assign(`/locacoes/contratos/${x.id}`)} columns={[
            { key: 'number', header: 'Contrato', render: (x) => <span className="strong mono">{x.number}</span> },
            { key: 'kind', header: 'Modalidade', render: (x) => CONTRACT_KIND_LABEL[x.kind as keyof typeof CONTRACT_KIND_LABEL] ?? x.kind },
            { key: 'period', header: 'Período', render: (x) => `${date(x.startAt)} a ${date(x.endAt)}` },
            { key: 'value', header: 'Valor', align: 'right', render: (x) => (x.monthlyAmount ? `${money(x.monthlyAmount)}/mês` : money(x.totalAmount)) },
            { key: 'status', header: 'Situação', render: (x) => <Status kind="contract" value={x.status} /> },
          ]} />
        </Card>
      )}
      {tab === 'finance' && (
        <Card title="Resumo financeiro" actions={can('finance.view') && <Link className="nc-btn nc-btn--secondary nc-btn--sm" to={`/financeiro/receber?customerId=${id}`}>Ver títulos</Link>}>
          <div className="stack">
            <KeyValue items={[
              { label: 'Títulos em aberto', value: d.summary.openReceivables }, { label: 'Saldo em aberto', value: money(d.summary.openBalance) },
              { label: 'Títulos vencidos', value: d.summary.overdueReceivables ? <Badge tone="danger">{d.summary.overdueReceivables}</Badge> : 0 },
            ]} />
            {d.deposits.length > 0 && (
              <DataTable rows={d.deposits} columns={[
                { key: 'contract', header: 'Caução do contrato', render: (x) => <Link to={`/locacoes/contratos/${x.contractId}`}>Abrir contrato</Link> },
                { key: 'value', header: 'Previsto', align: 'right', render: (x) => money(x.expectedAmount) },
                { key: 'status', header: 'Situação', render: (x) => DEPOSIT_STATUS_LABEL[x.status as keyof typeof DEPOSIT_STATUS_LABEL] ?? x.status },
              ]} />
            )}
          </div>
        </Card>
      )}
      {tab === 'documents' && <Card><Attachments entityType="Customer" entityId={id} canWrite={can('customers.edit') && !anonymized} categories={[
        { value: 'Documento de identidade', label: 'Documento de identidade' }, { value: 'Comprovante de residência', label: 'Comprovante de residência' },
        { value: 'Contrato social', label: 'Contrato social' }, { value: 'Outro', label: 'Outro' },
      ]} /></Card>}
      {tab === 'lgpd' && <LgpdTab customer={d} onChanged={c.reload} />}
      {editing && <CustomerForm customer={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); c.reload(); }} />}
      {driver && <DriverForm driver={driver === 'new' ? null : driver} customer={{ id, name: d.name }} onClose={() => setDriver(null)} onSaved={() => { setDriver(null); c.reload(); }} />}
      {asDriver && <AsDriverModal customerId={id} type={d.type} onClose={() => setAsDriver(false)} onSaved={() => { setAsDriver(false); c.reload(); }} />}
    </Page>
  );
}

export function CnhBadge({ date: value, days }: { date: string; days: number }) {
  return <span className="row" style={{ gap: 6 }}>{date(value)}{days < 0 ? <Badge tone="danger">Vencida</Badge> : days <= 30 ? <Badge tone="warning">{days} dias</Badge> : null}</span>;
}

function AsDriverModal({ customerId, type, onClose, onSaved }: { customerId: string; type: PersonType; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ cnhNumber: '', cnhCategory: 'B', cnhExpiresAt: '' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Cadastrar o cliente como motorista" description="Nome, CPF e contato vêm do cadastro do cliente."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={type !== 'PF' || !/^\d{9,11}$/.test(f.cnhNumber) || !f.cnhExpiresAt} onClick={async () => {
        setBusy(true);
        try { await api.post(`/customers/${customerId}/as-driver`, f); toast.success('Motorista cadastrado'); onSaved(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Cadastrar</Button></>}>
      <FormGrid>
        <Field label="Número da CNH" required className="span-6"><Input value={f.cnhNumber} inputMode="numeric" onChange={(e) => setF({ ...f, cnhNumber: e.target.value.replace(/\D/g, '').slice(0, 11) })} /></Field>
        <Field label="Categoria" required className="span-2"><Select value={f.cnhCategory} onChange={(e) => setF({ ...f, cnhCategory: e.target.value })} options={CNH_OPTIONS} /></Field>
        <Field label="Validade" required className="span-4"><Input type="date" value={f.cnhExpiresAt} onChange={(e) => setF({ ...f, cnhExpiresAt: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}

function LgpdTab({ customer, onChanged }: { customer: CustomerDetail; onChanged: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const exportData = async () => {
    try {
      const data = await api.get<unknown>(`/customers/${customer.id}/personal-data`);
      saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `dados-pessoais-${customer.id}.json`);
      toast.success('Arquivo gerado', 'A exportação ficou registrada na auditoria.');
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const anonymize = async () => {
    const r = await confirm({
      title: 'Anonimizar cliente', confirmLabel: 'Anonimizar', requireReason: true, reasonLabel: 'Fundamento (ex.: pedido do titular)',
      message: 'Nome, documento, contatos e endereço são substituídos de forma irreversível, inclusive dos motoristas vinculados. Contratos e títulos históricos permanecem sem identificação. Só é possível sem contrato em andamento e sem títulos em aberto.',
    });
    if (!r.confirmed) return;
    api.post(`/customers/${customer.id}/anonymize`, { reason: r.reason }).then(() => { toast.success('Cliente anonimizado'); onChanged(); }).catch((e) => toast.error(errorMessage(e)));
  };
  return (
    <div className="grid-2">
      {can('customers.sensitive') && (
        <Card title="Acesso aos dados (art. 18)" subtitle="Gera um arquivo com todos os dados pessoais do titular guardados pela locadora.">
          <Button icon={Download} onClick={exportData} disabled={Boolean(customer.anonymizedAt)}>Exportar dados pessoais</Button>
        </Card>
      )}
      {can('customers.delete') && (
        <Card title="Eliminação / anonimização" subtitle="Quando cabível legalmente, remove a identificação do titular.">
          <div className="stack">
            {(customer.summary.activeContracts > 0 || customer.summary.openReceivables > 0) && (
              <Alert tone="warning">Há {customer.summary.activeContracts} contrato(s) ativo(s) e {customer.summary.openReceivables} título(s) em aberto. A anonimização será recusada até a regularização.</Alert>
            )}
            <div><Button variant="danger" icon={ShieldOff} onClick={anonymize} disabled={Boolean(customer.anonymizedAt)}>Anonimizar</Button></div>
          </div>
        </Card>
      )}
    </div>
  );
}
