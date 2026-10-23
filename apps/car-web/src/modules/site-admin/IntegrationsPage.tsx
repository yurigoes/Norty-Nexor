import { useState } from 'react';
import { Copy, KeyRound, Plus, Send, Trash2, Webhook } from 'lucide-react';
import type { ApiKeyRow, WebhookRow } from '@nortycar/shared';
import { Alert, Badge, Button, Card, Page, PageHeader, Tabs } from '../../components/ui';
import { Checkbox, Field, Input } from '../../components/form';
import { DataTable } from '../../components/table';
import { Modal, useConfirm } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, dateTime, relative } from '../../lib/format';

/** Segredo exibido uma única vez, com cópia. */
function SecretOnce({ title, value, onClose }: { title: string; value: string | null; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={title} description="Copie agora: por segurança, este valor não será exibido de novo."
      footer={<><Button icon={Copy} onClick={() => value && navigator.clipboard.writeText(value).then(() => toast.success('Copiado'))}>Copiar</Button><Button variant="primary" onClick={onClose}>Já copiei</Button></>}>
      <code className="mono" style={{ display: 'block', wordBreak: 'break-all', padding: 12, background: 'var(--surface-sunken)', borderRadius: 8 }}>{value}</code>
    </Modal>
  );
}

export function IntegrationsPage() {
  const [tab, setTab] = useState<'keys' | 'webhooks' | 'providers'>('keys');
  return (
    <Page>
      <PageHeader title="Integrações" description="Chaves da API de integração, webhooks de eventos e provedores externos. Situação mostrada é a real: nada é dado como integrado sem comunicação testada." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'keys', label: 'Chaves de API' }, { value: 'webhooks', label: 'Webhooks' }, { value: 'providers', label: 'Provedores' }]} />
      {tab === 'keys' && <ApiKeys />}
      {tab === 'webhooks' && <Webhooks />}
      {tab === 'providers' && <Providers />}
    </Page>
  );
}

function ApiKeys() {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useApi(() => api.get<ApiKeyRow[]>('/integrations/api-keys'), []);
  const scopes = useApi(() => api.get<{ key: string; label: string }[]>('/integrations/scopes'), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <div className="stack">
      <Alert tone="info">Use no cabeçalho <span className="mono">Authorization: ApiKey &lt;chave&gt;</span>. A API é somente leitura e cada chamada fica na auditoria. Documentação em docs/norty-car/API.md.</Alert>
      <div className="row-between"><span /><Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Nova chave</Button></div>
      <Card flush>
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={{ title: 'Nenhuma chave criada', icon: KeyRound }} columns={[
          { key: 'name', header: 'Nome', render: (k) => <div><div className="strong">{k.name}</div><div className="xsmall muted mono">nc_live_{k.prefix}_…</div></div> },
          { key: 'scopes', header: 'Escopos', render: (k) => <span className="small mono">{k.scopes.join(', ')}</span> },
          { key: 'used', header: 'Último uso', render: (k) => k.lastUsedAt ? relative(k.lastUsedAt) : 'Nunca' },
          { key: 'exp', header: 'Expira', render: (k) => k.expiresAt ? date(k.expiresAt) : 'Sem expiração' },
          { key: 'status', header: 'Situação', render: (k) => k.revokedAt ? <Badge dot>Revogada</Badge> : k.active ? <Badge tone="success" dot>Ativa</Badge> : <Badge tone="warning" dot>Expirada</Badge> },
          { key: 'actions', header: '', render: (k) => !k.revokedAt && <Button size="sm" variant="danger" onClick={async () => {
            const r = await confirm({ title: 'Revogar chave', message: `Integrações que usam "${k.name}" param na hora.`, confirmLabel: 'Revogar' });
            if (r.confirmed) api.del(`/integrations/api-keys/${k.id}`).then(() => { toast.success('Chave revogada'); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
          }}>Revogar</Button> },
        ]} />
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nova chave de API" footer={<><Button onClick={() => setCreating(false)}>Cancelar</Button><Button variant="primary" disabled={name.length < 2 || !chosen.length} onClick={() => api.post<{ key: string }>('/integrations/api-keys', { name, scopes: chosen, expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59-03:00`).toISOString() : undefined })
        .then((r) => { setCreating(false); setName(''); setChosen([]); setExpiresAt(''); setSecret(r.key); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Criar</Button></>}>
        <div className="stack">
          <Field label="Nome" required hint="Ex.: ERP, sistema de rastreamento."><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="stack-sm"><span className="nc-label">Escopos</span>{(scopes.data ?? []).map((s) => <Checkbox key={s.key} label={<span><span className="mono small">{s.key}</span> — {s.label}</span>} checked={chosen.includes(s.key)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.key] : c.filter((x) => x !== s.key)))} />)}</div>
          <Field label="Expira em (opcional)"><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>
        </div>
      </Modal>
      <SecretOnce title="Chave criada" value={secret} onClose={() => setSecret(null)} />
    </div>
  );
}

function Webhooks() {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useApi(() => api.get<WebhookRow[]>('/integrations/webhooks'), []);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('*');
  const [secret, setSecret] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const test = async (w: WebhookRow) => {
    setTesting(w.id);
    try {
      const r = await api.post<{ ok: boolean; status: number; error: string | null; durationMs: number }>(`/integrations/webhooks/${w.id}/test`);
      if (r.ok) toast.success('Entrega confirmada', `HTTP ${r.status} em ${r.durationMs} ms.`);
      else toast.error('Falha na entrega', r.error ?? `HTTP ${r.status}`);
      list.reload();
    } catch (e) { toast.error(errorMessage(e)); } finally { setTesting(null); }
  };
  return (
    <div className="stack">
      <Alert tone="info">Cada entrega leva <span className="mono">X-NortyCar-Signature: sha256=…</span> (HMAC do corpo com o segredo) para o seu sistema validar a origem.</Alert>
      <div className="row-between"><span /><Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo webhook</Button></div>
      <Card flush>
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={{ title: 'Nenhum webhook', icon: Webhook }} columns={[
          { key: 'url', header: 'Destino', render: (w) => <span className="mono small">{w.url}</span> },
          { key: 'events', header: 'Eventos', render: (w) => <span className="mono small">{w.events.join(', ')}</span> },
          { key: 'last', header: 'Última entrega', render: (w) => w.lastDeliveryAt ? <span className="small">{dateTime(w.lastDeliveryAt)} · {w.lastStatus ? `HTTP ${w.lastStatus}` : 'sem resposta'}</span> : 'Nunca' },
          { key: 'active', header: 'Situação', render: (w) => w.active ? <Badge tone="success" dot>Ativo</Badge> : <Badge dot>Pausado</Badge> },
          { key: 'actions', header: '', render: (w) => (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button size="sm" icon={Send} loading={testing === w.id} onClick={() => test(w)}>Testar</Button>
              <Button size="sm" onClick={() => api.patch(`/integrations/webhooks/${w.id}`, { active: !w.active }).then(list.reload).catch((e) => toast.error(errorMessage(e)))}>{w.active ? 'Pausar' : 'Ativar'}</Button>
              <Button size="sm" variant="ghost" icon={Trash2} aria-label="Excluir webhook" onClick={async () => {
                const r = await confirm({ title: 'Excluir webhook', message: 'As entregas para este destino param.', confirmLabel: 'Excluir' });
                if (r.confirmed) api.del(`/integrations/webhooks/${w.id}`).then(list.reload).catch((e) => toast.error(errorMessage(e)));
              }} />
            </div>
          ) },
        ]} />
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Novo webhook" footer={<><Button onClick={() => setCreating(false)}>Cancelar</Button><Button variant="primary" disabled={!url} onClick={() => api.post<{ secret: string }>('/integrations/webhooks', { url, events: events.split(',').map((s) => s.trim()).filter(Boolean) })
        .then((r) => { setCreating(false); setUrl(''); setSecret(r.secret); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Criar</Button></>}>
        <div className="stack">
          <Field label="URL de destino" required hint="HTTPS em produção."><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seu-sistema.com.br/webhooks/nortycar" /></Field>
          <Field label="Eventos" hint='Use "*" para todos ou tipos separados por vírgula, como contract.expiring.'><Input value={events} onChange={(e) => setEvents(e.target.value)} /></Field>
        </div>
      </Modal>
      <SecretOnce title="Segredo do webhook" value={secret} onClose={() => setSecret(null)} />
    </div>
  );
}

interface Providers {
  payments: { id: string; name: string; status: string; lastTestAt: string | null; lastTestResult: string | null; webhookUrl: string; hasSecret: boolean; updatedAt: string }[];
  esign: { status: string; detail: string };
  whatsapp: { status: string; detail: string };
}

function Providers() {
  const toast = useToast();
  const confirm = useConfirm();
  const data = useApi(() => api.get<Providers>('/integrations/providers'), []);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  return (
    <div className="stack">
      <Card title="Provedor de pagamento" subtitle="Pix, boleto e cartão dependem do contrato com um provedor. Aqui fica o segredo com que ele assina os webhooks de confirmação.">
        <div className="stack">
          {data.data?.payments.length ? data.data.payments.map((p) => (
            <div key={p.id} className="nc-card" style={{ padding: 12 }}>
              <div className="row-between"><strong>{p.name}</strong><Status kind="integration" value={p.status} /></div>
              <div className="small">URL do webhook para cadastrar no provedor: <span className="mono">{p.webhookUrl}</span> <Button size="sm" variant="ghost" icon={Copy} aria-label="Copiar URL" onClick={() => navigator.clipboard.writeText(p.webhookUrl).then(() => toast.success('Copiado'))} /></div>
              <div className="xsmall muted">{p.status === 'VERIFIED' ? `Último evento válido ${p.lastTestAt ? relative(p.lastTestAt) : ''}` : 'Fica "verificado" quando o primeiro evento assinado for aceito.'}</div>
              <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" variant="ghost" icon={Trash2} onClick={async () => {
                const r = await confirm({ title: 'Remover provedor', message: 'Webhooks deste provedor passam a ser recusados.', confirmLabel: 'Remover' });
                if (r.confirmed) api.del(`/integrations/providers/${p.id}`).then(data.reload).catch((e) => toast.error(errorMessage(e)));
              }}>Remover</Button></div>
            </div>
          )) : <Alert tone="warning">Pendente de configuração: nenhum provedor de pagamento cadastrado. As baixas continuam manuais pelo financeiro.</Alert>}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Nome do provedor" hint="Ex.: asaas, pagarme, mercadopago."><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} /></Field>
            <Field label="Segredo de assinatura do webhook" hint="Fornecido pelo painel do provedor. Fica cifrado."><Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" /></Field>
            <Button variant="primary" disabled={name.length < 2 || secret.length < 16} onClick={() => api.put('/integrations/providers/payment', { name, webhookSecret: secret }).then(() => { toast.success('Provedor salvo'); setName(''); setSecret(''); data.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Salvar</Button>
          </div>
        </div>
      </Card>
      <div className="grid-2">
        <Card title="Assinatura eletrônica" actions={<Status kind="integration" value={data.data?.esign.status ?? 'NOT_CONFIGURED'} />}><p className="small muted">{data.data?.esign.detail}</p></Card>
        <Card title="WhatsApp Business" actions={<Status kind="integration" value={data.data?.whatsapp.status ?? 'NOT_CONFIGURED'} />}><p className="small muted">{data.data?.whatsapp.detail}</p></Card>
      </div>
    </div>
  );
}
