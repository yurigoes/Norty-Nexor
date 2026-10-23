import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { MessagesSquare, Send } from 'lucide-react';
import { SERVICE_REQUEST_STATUS_LABEL, SERVICE_REQUEST_TYPE_LABEL, type ServiceRequestRow } from '@nortycar/shared';
import { Alert, Button, Card, Page, PageHeader } from '../../components/ui';
import { Checkbox, Field, Textarea } from '../../components/form';
import { DataTable, type Column } from '../../components/table';
import { Drawer } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dateTime, relative } from '../../lib/format';

/** Atendimento das solicitações abertas pelos clientes no portal. */
export function ServiceRequestsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const list = useApi(() => api.get<ServiceRequestRow[]>('/service-requests', { status }), [status]);
  const open = list.data?.find((r) => r.id === params.get('id')) ?? null;
  const [body, setBody] = useState('');
  const [closeIt, setCloseIt] = useState(false);
  const columns: Column<ServiceRequestRow>[] = [
    { key: 'customer', header: 'Cliente', render: (r) => r.customer?.name ?? '—' },
    { key: 'subject', header: 'Assunto', render: (r) => <div><div className="strong">{r.subject}</div><div className="xsmall muted">{SERVICE_REQUEST_TYPE_LABEL[r.type]}</div></div> },
    { key: 'updated', header: 'Atualizada', render: (r) => relative(r.updatedAt) },
    { key: 'status', header: 'Situação', render: (r) => <Status kind="request" value={r.status} /> },
  ];
  const send = () => open && api.post(`/service-requests/${open.id}/messages`, { body, close: closeIt })
    .then(() => { toast.success(closeIt ? 'Respondida e encerrada' : 'Resposta enviada', 'O cliente é notificado no portal.'); setBody(''); setCloseIt(false); setParams({}); list.reload(); })
    .catch((e) => toast.error(errorMessage(e)));
  const lgpd = open && ['DATA_ACCESS', 'DATA_CORRECTION'].includes(open.type);
  return (
    <Page>
      <PageHeader title="Solicitações do portal" description="Pedidos dos clientes: manutenção, assistência, troca, renovação, encerramento e direitos LGPD." />
      <Card flush>
        <DataTable columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(r) => setParams({ id: r.id })}
          empty={{ title: 'Nenhuma solicitação', icon: MessagesSquare }}
          toolbar={<select className="nc-select" style={{ width: 200 }} value={status} aria-label="Situação" onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>{Object.entries(SERVICE_REQUEST_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>} />
      </Card>
      <Drawer open={Boolean(open)} onClose={() => setParams({})} wide title={open?.subject ?? ''} description={open ? `${open.customer?.name ?? ''} · ${SERVICE_REQUEST_TYPE_LABEL[open.type]} · ${dateTime(open.createdAt)}` : ''}
        footer={open && open.status !== 'CLOSED' && <>
          <Checkbox label="Encerrar ao responder" checked={closeIt} onChange={(e) => setCloseIt(e.target.checked)} />
          <span className="grow" />
          <Button onClick={() => api.post(`/service-requests/${open.id}/status`, { status: 'IN_PROGRESS' }).then(list.reload).catch((e) => toast.error(errorMessage(e)))}>Em atendimento</Button>
          <Button variant="primary" icon={Send} disabled={!body.trim()} onClick={send}>Responder</Button>
        </>}>
        {open && (
          <div className="stack">
            {lgpd && <Alert tone="warning" title="Pedido de titular (LGPD)">{open.type === 'DATA_ACCESS' ? 'Exporte os dados pessoais na ficha do cliente (aba LGPD) e responda dentro do prazo legal.' : 'Corrija o cadastro na ficha do cliente e registre aqui o que foi alterado.'} {open.customer && <Link to={`/pessoas/clientes/${open.customer.id}`}>Abrir ficha</Link>}</Alert>}
            <div className="nc-card" style={{ padding: 12, whiteSpace: 'pre-wrap' }}>{open.description}</div>
            {open.messages.map((m) => (
              <div key={m.id} className="nc-card" style={{ padding: 12, background: m.fromCustomer ? undefined : 'var(--brand-softer)' }}>
                <div className="xsmall muted">{m.fromCustomer ? 'Cliente' : 'Equipe'} · {dateTime(m.createdAt)}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
              </div>
            ))}
            {open.status !== 'CLOSED' && <Field label="Resposta ao cliente"><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} /></Field>}
          </div>
        )}
      </Drawer>
    </Page>
  );
}
