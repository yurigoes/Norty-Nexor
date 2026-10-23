import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Inbox, Mail, Phone } from 'lucide-react';
import { LEAD_KIND_LABEL, LEAD_STATUS_LABEL, type LeadRow, type Paginated } from '@nortycar/shared';
import { Alert, Button, Card, KeyValue, Page, PageHeader } from '../../components/ui';
import { DataTable, Pagination, SearchInput, type Column } from '../../components/table';
import { Drawer, useConfirm } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { dateTime, money, relative, toLocalInput } from '../../lib/format';
import { useSession } from '../../lib/session';

/** Pedidos recebidos pelo site. Nenhum vira reserva sozinho: alguém da equipe confere e converte. */
export function LeadsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('NEW');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q);
  const list = useApi(() => api.get<Paginated<LeadRow>>('/leads', { status, kind, q: term, page, pageSize: 25 }), [status, kind, term, page]);
  const openId = params.get('id');
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const open = selected ?? list.data?.items.find((l) => l.id === openId) ?? null;

  const update = async (lead: LeadRow, next: 'IN_PROGRESS' | 'DISCARDED' | 'NEW') => {
    let reason: string | undefined;
    if (next === 'DISCARDED') {
      const r = await confirm({ title: 'Descartar pedido', message: `O pedido de ${lead.name} sai da fila.`, requireReason: true, confirmLabel: 'Descartar' });
      if (!r.confirmed) return;
      reason = r.reason;
    }
    api.patch(`/leads/${lead.id}`, { status: next, reason }).then(() => { toast.success('Pedido atualizado'); setSelected(null); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
  };

  /** Leva para a criação de reserva já preenchida; o módulo de reservas marca o pedido como convertido. */
  const toReservation = (l: LeadRow) => {
    const qs = new URLSearchParams({ novo: '1', leadId: l.id, name: l.name });
    if (l.email) qs.set('email', l.email);
    if (l.phone) qs.set('phone', l.phone);
    if (l.categoryId) qs.set('categoryId', l.categoryId);
    if (l.startAt) qs.set('startAt', l.startAt);
    if (l.endAt) qs.set('endAt', l.endAt);
    navigate(`/locacoes/reservas?${qs.toString()}`);
  };

  const columns: Column<LeadRow>[] = [
    { key: 'when', header: 'Recebido', render: (l) => <span className="small nowrap">{relative(l.createdAt)}</span> },
    { key: 'name', header: 'Contato', render: (l) => <div><div className="strong">{l.name}</div><div className="xsmall muted">{[l.email, l.phone].filter(Boolean).join(' · ')}</div></div> },
    { key: 'kind', header: 'Tipo', render: (l) => LEAD_KIND_LABEL[l.kind] },
    { key: 'what', header: 'Interesse', render: (l) => <div className="small">{l.modelName ?? l.categoryName ?? '—'}{l.startAt && <div className="xsmall muted">{dateTime(l.startAt)} → {dateTime(l.endAt)}</div>}</div> },
    { key: 'quote', header: 'Cotação', align: 'right', render: (l) => l.quote ? money(l.quote.total) : '—' },
    { key: 'status', header: 'Situação', render: (l) => <Status kind="lead" value={l.status} /> },
  ];

  return (
    <Page>
      <PageHeader title="Pedidos do site" description="Orçamentos, contatos e pedidos de reserva enviados pelo site público. A reserva só existe depois que a equipe confirma." />
      <Card flush>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(l) => { setSelected(l); setParams({ id: l.id }); }}
          empty={{ title: 'Nenhum pedido nesta fila', icon: Inbox, description: 'Pedidos chegam quando o site está publicado em Administração › Site público.' }}
          toolbar={<>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Nome, e-mail ou telefone" />
            <div className="nc-filters">
              <select className="nc-select" value={status} aria-label="Situação" onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">Todas</option>{Object.entries(LEAD_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="nc-select" value={kind} aria-label="Tipo" onChange={(e) => { setKind(e.target.value); setPage(1); }}>
                <option value="">Todos os tipos</option>{Object.entries(LEAD_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </>}
          footer={list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />} />
      </Card>
      <Drawer open={Boolean(open)} onClose={() => { setSelected(null); setParams({}); }} title={open?.name ?? ''} description={open ? `${LEAD_KIND_LABEL[open.kind]} · ${dateTime(open.createdAt)}` : ''}
        footer={open && open.status !== 'CONVERTED' && <>
          {open.status !== 'DISCARDED' && <Button onClick={() => update(open, 'DISCARDED')}>Descartar</Button>}
          {open.status === 'NEW' && <Button onClick={() => update(open, 'IN_PROGRESS')}>Em atendimento</Button>}
          {open.status === 'DISCARDED' && <Button onClick={() => update(open, 'NEW')}>Reabrir</Button>}
          {can('reservations.create') && open.status !== 'DISCARDED' && <Button variant="primary" icon={CalendarPlus} onClick={() => toReservation(open)}>Criar reserva</Button>}
        </>}>
        {open && (
          <div className="stack">
            <div className="row">
              {open.email && <a className="nc-btn nc-btn--secondary nc-btn--sm" href={`mailto:${open.email}`}><Mail aria-hidden /> {open.email}</a>}
              {open.phone && <a className="nc-btn nc-btn--secondary nc-btn--sm" href={`tel:${open.phone.replace(/\D/g, '')}`}><Phone aria-hidden /> {open.phone}</a>}
            </div>
            <KeyValue items={[
              { label: 'Situação', value: <Status kind="lead" value={open.status} /> },
              { label: 'Modelo', value: open.modelName, hidden: !open.modelName },
              { label: 'Categoria', value: open.categoryName, hidden: !open.categoryName },
              { label: 'Retirada', value: dateTime(open.startAt), hidden: !open.startAt },
              { label: 'Devolução', value: dateTime(open.endAt), hidden: !open.endAt },
              { label: 'Cotação do servidor', value: open.quote ? `${money(open.quote.total)} · ${open.quote.billableDays} diária(s)` : null, hidden: !open.quote },
            ]} />
            {open.message && <div><span className="nc-section-title">Mensagem</span><p style={{ whiteSpace: 'pre-wrap' }}>{open.message}</p></div>}
            {open.startAt && <Alert tone="info">Disponibilidade e valor finais são confirmados na criação da reserva (retirada sugerida {toLocalInput(open.startAt).replace('T', ' ')}).</Alert>}
            <Alert tone="neutral">Consentimento LGPD registrado no envio do formulário.</Alert>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
