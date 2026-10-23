import { useState } from 'react';
import { LifeBuoy, Plus, Send } from 'lucide-react';
import { Alert, Button, Card, EmptyState, Page, PageHeader, Tabs } from '../../components/ui';
import { Field, Input, Textarea } from '../../components/form';
import { DataTable, type Column } from '../../components/table';
import { Modal, useConfirm } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dateTime } from '../../lib/format';
import { useSession } from '../../lib/session';
import { PERMISSIONS, type Permission } from '@nortycar/shared';

interface Grant { id: string; purpose: string; scope: string[]; durationHours: number; status: string; createdAt: string; decidedAt: string | null; expiresAt: string | null; decisionNote: string | null; requestedBy: { name: string; email: string } }
interface Ticket { id: string; subject: string; description: string; status: string; createdAt: string; updatedAt: string; messages: { id: string; body: string; fromNorty: boolean; createdAt: string }[] }

export function SupportPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<'grants' | 'tickets'>(can('support.approve') ? 'grants' : 'tickets');
  return (
    <Page>
      <PageHeader title="Suporte Norty" description="Chamados com a equipe Norty e autorização de acesso excepcional aos dados da empresa." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'grants', label: 'Acessos do suporte', hidden: !can('support.approve') }, { value: 'tickets', label: 'Chamados', hidden: !can('settings.manage') }]} />
      {tab === 'grants' ? <Grants /> : <Tickets />}
    </Page>
  );
}

function Grants() {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useApi(() => api.get<Grant[]>('/support/grants'), []);
  const decide = async (g: Grant, action: 'approve' | 'reject' | 'revoke') => {
    const r = await confirm({
      title: action === 'approve' ? 'Autorizar acesso do suporte' : action === 'reject' ? 'Recusar acesso' : 'Revogar acesso',
      message: action === 'approve' ? `${g.requestedBy.name} poderá consultar (somente leitura) os módulos pedidos por ${g.durationHours} h. Tudo fica registrado na auditoria.` : 'A decisão fica registrada.',
      confirmLabel: action === 'approve' ? 'Autorizar' : action === 'reject' ? 'Recusar' : 'Revogar', tone: action === 'approve' ? 'primary' : 'danger',
      requireReason: action !== 'approve', reasonLabel: 'Observação',
    });
    if (!r.confirmed) return;
    api.post(`/support/grants/${g.id}/${action}`, { note: r.reason || undefined }).then(() => { toast.success('Decisão registrada'); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
  };
  const columns: Column<Grant>[] = [
    { key: 'who', header: 'Solicitante', render: (g) => <div><div className="strong">{g.requestedBy.name}</div><div className="xsmall muted">{g.requestedBy.email}</div></div> },
    { key: 'purpose', header: 'Finalidade', render: (g) => <div><div>{g.purpose}</div><div className="xsmall muted">{g.scope.map((p) => PERMISSIONS[p as Permission]?.label ?? p).join(', ')}</div></div> },
    { key: 'duration', header: 'Prazo', render: (g) => g.expiresAt ? `até ${dateTime(g.expiresAt)}` : `${g.durationHours} h após autorizar` },
    { key: 'status', header: 'Situação', render: (g) => <Status kind="grant" value={g.status} /> },
    { key: 'actions', header: '', render: (g) => (
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {g.status === 'REQUESTED' && <><Button size="sm" onClick={() => decide(g, 'reject')}>Recusar</Button><Button size="sm" variant="primary" onClick={() => decide(g, 'approve')}>Autorizar</Button></>}
        {g.status === 'APPROVED' && <Button size="sm" variant="danger" onClick={() => decide(g, 'revoke')}>Revogar</Button>}
      </div>
    ) },
  ];
  return (
    <div className="stack">
      <Alert tone="info">A equipe Norty não acessa os dados operacionais da sua empresa sem autorização. Cada pedido traz finalidade, escopo e prazo; o acesso é somente leitura e todas as ações aparecem na auditoria.</Alert>
      <Card flush><DataTable columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={{ title: 'Nenhum pedido de acesso', icon: LifeBuoy }} /></Card>
    </div>
  );
}

function Tickets() {
  const toast = useToast();
  const list = useApi(() => api.get<Ticket[]>('/support/tickets'), []);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Ticket | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reply, setReply] = useState('');
  return (
    <div className="stack">
      <div className="row-between"><span /><Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Abrir chamado</Button></div>
      <Card flush>
        {list.data && !list.data.length ? <EmptyState title="Nenhum chamado" icon={LifeBuoy} /> : (
          <DataTable rows={list.data} loading={list.loading} error={list.error} onRowClick={setOpen} columns={[
            { key: 'subject', header: 'Assunto', render: (t) => <span className="strong">{t.subject}</span> },
            { key: 'updated', header: 'Atualizado', render: (t) => dateTime(t.updatedAt) },
            { key: 'status', header: 'Situação', render: (t) => <Status kind="ticket" value={t.status} /> },
          ]} />
        )}
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Abrir chamado" footer={<><Button onClick={() => setCreating(false)}>Cancelar</Button><Button variant="primary" disabled={subject.length < 3 || description.length < 3} onClick={() => api.post('/support/tickets', { subject, description }).then(() => { toast.success('Chamado aberto'); setCreating(false); setSubject(''); setDescription(''); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Enviar</Button></>}>
        <div className="stack"><Field label="Assunto" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field><Field label="Descrição" required><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} /></Field></div>
      </Modal>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} size="lg" title={open?.subject ?? ''} description={open ? `Aberto em ${dateTime(open.createdAt)}` : ''}
        footer={<><Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Responder…" /><Button variant="primary" icon={Send} disabled={!reply.trim()} onClick={() => open && api.post(`/support/tickets/${open.id}/messages`, { body: reply }).then(() => { setReply(''); setOpen(null); list.reload(); toast.success('Mensagem enviada'); }).catch((e) => toast.error(errorMessage(e)))}>Enviar</Button></>}>
        {open && (
          <div className="stack">
            <div className="nc-card" style={{ padding: 12 }}>{open.description}</div>
            {open.messages.map((m) => (
              <div key={m.id} className="nc-card" style={{ padding: 12, background: m.fromNorty ? 'var(--brand-softer)' : undefined }}>
                <div className="xsmall muted">{m.fromNorty ? 'Equipe Norty' : 'Sua empresa'} · {dateTime(m.createdAt)}</div>
                <div>{m.body}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
