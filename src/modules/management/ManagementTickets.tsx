import { useMemo, useState } from 'react';
import { CheckCircle2, MessageSquare, UserPlus, Wrench } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL, addTicketUpdate, assignTicket, priorityTone,
  ticketTone, tickets,
} from '../../services/tickets';
import { ticketsByCategory } from '../../services/analytics';
import { unitLabel } from '../../services/directory';
import type { Ticket } from '../../data/types';
import {
  Badge, Button, Card, CardHeader, DataTable, Drawer, EmptyState, PageHeader, Pagination,
  SearchInput, Select, StatCard, Tabs, Textarea, Timeline, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { RankBars } from '../../components/charts/Charts';
import { formatDateTime, timeAgo } from '../../lib/date';
import { number } from '../../lib/format';
import { TICKET_CATEGORIES } from '../../data/seed/random';

const PAGE_SIZE = 20;
const ASSIGNEES = ['Equipe de Manutenção', 'Zeladoria', 'Elevalux Elevadores', 'HidroPrime Serviços', 'SegurPro Sistemas', 'Administração'];

export function ManagementTickets() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();

  const [tab, setTab] = useState('abertos');
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [message, setMessage] = useState('');
  const [assignee, setAssignee] = useState(ASSIGNEES[0]);

  const all = useMemo(() => tickets(condominium.id), [condominium.id, dataVersion]);
  const open = all.filter((t) => t.status === 'aberto' || t.status === 'em_andamento');
  const closed = all.filter((t) => t.status === 'resolvido' || t.status === 'cancelado');
  const categories = useMemo(() => ticketsByCategory(condominium.id), [condominium.id, dataVersion]);

  const filtered = useMemo(() => {
    const base = tab === 'abertos' ? open : tab === 'encerrados' ? closed : all;
    const q = term.trim().toLowerCase();
    return base.filter((t) =>
      (!q || [t.title, t.code, t.location, t.openedBy].some((f) => f.toLowerCase().includes(q)))
      && (!category || t.category === category)
      && (!priority || t.priority === priority));
  }, [tab, open, closed, all, term, category, priority]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const refresh = (id: string) => {
    const next = all.find((t) => t.id === id);
    setSelected(next ?? null);
  };

  const columns: Column<Ticket>[] = [
    { key: 'title', header: 'Chamado', render: (t) => <CellStack title={t.title} meta={`${t.code} · ${t.category}`} /> },
    { key: 'location', header: 'Local', hideOnMobile: true, render: (t) => <CellStack title={t.location} meta={t.unitId ? unitLabel(t.unitId) : undefined} /> },
    { key: 'opened', header: 'Aberto por', hideOnMobile: true, render: (t) => <CellStack title={t.openedBy} meta={timeAgo(t.createdAt)} /> },
    { key: 'assigned', header: 'Responsável', hideOnMobile: true, render: (t) => t.assignedTo ?? <span className="nx-text-subtle">Não atribuído</span> },
    { key: 'priority', header: 'Prioridade', render: (t) => <Badge tone={priorityTone(t.priority)} size="sm">{TICKET_PRIORITY_LABEL[t.priority]}</Badge> },
    { key: 'status', header: 'Status', align: 'right', render: (t) => <Badge tone={ticketTone(t.status)} size="sm">{TICKET_STATUS_LABEL[t.status]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<Wrench size={22} />}
        title="Chamados"
        subtitle="Solicitações de manutenção e serviços do condomínio"
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => { setTab(id); setPage(1); }}
            items={[
              { id: 'abertos', label: 'Em aberto', count: open.length },
              { id: 'encerrados', label: 'Encerrados', count: closed.length },
              { id: 'todos', label: 'Todos', count: all.length },
            ]}
          />
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Chamados abertos" value={number(open.length)} icon={<Wrench size={17} />} tone="warning" />
        <StatCard label="Urgentes / alta prioridade" value={number(open.filter((t) => t.priority === 'urgente' || t.priority === 'alta').length)} icon={<Wrench size={17} />} tone="danger" />
        <StatCard label="Sem responsável" value={number(open.filter((t) => !t.assignedTo).length)} icon={<UserPlus size={17} />} tone="neutral" />
        <StatCard label="Resolvidos" value={number(all.filter((t) => t.status === 'resolvido').length)} icon={<CheckCircle2 size={17} />} tone="success" />
      </div>

      <div className="nx-dash-charts">
        <Card padding="none">
          <FilterBar>
            <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por título, código, local ou autor..." />
            <Select options={TICKET_CATEGORIES.map((c) => ({ value: c, label: c }))} placeholder="Todas as categorias" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} selectSize="sm" />
            <Select options={Object.entries(TICKET_PRIORITY_LABEL).map(([value, label]) => ({ value, label }))} placeholder="Todas as prioridades" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} selectSize="sm" />
          </FilterBar>
          <DataTable
            columns={columns}
            rows={paged}
            keyOf={(t) => t.id}
            onRowClick={setSelected}
            empty={<EmptyState icon={<Wrench size={24} />} title="Nenhum chamado encontrado" description="Ajuste os filtros para ampliar a busca." />}
            mobileCard={(t) => (
              <div className="nx-stack nx-gap-2">
                <div className="nx-row nx-between nx-gap-2">
                  <span className="nx-medium">{t.title}</span>
                  <Badge tone={ticketTone(t.status)} size="sm">{TICKET_STATUS_LABEL[t.status]}</Badge>
                </div>
                <span className="nx-text-xs nx-text-subtle">{t.code} · {t.location} · {timeAgo(t.createdAt)}</span>
              </div>
            )}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        </Card>

        <Card padding="md">
          <CardHeader title="Chamados por categoria" subtitle="Últimos 90 dias" />
          <RankBars data={categories} />
        </Card>
      </div>

      <Drawer
        open={selected !== null}
        onClose={() => { setSelected(null); setMessage(''); }}
        title={selected?.title}
        subtitle={selected ? `${selected.code} · ${selected.category} · ${selected.location}` : undefined}
        width={520}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <div className="nx-row nx-gap-2 nx-wrap">
              <Badge tone={ticketTone(selected.status)}>{TICKET_STATUS_LABEL[selected.status]}</Badge>
              <Badge tone={priorityTone(selected.priority)}>{TICKET_PRIORITY_LABEL[selected.priority]}</Badge>
              {selected.unitId && <Badge tone="neutral">{unitLabel(selected.unitId)}</Badge>}
            </div>

            <p className="nx-text-muted">{selected.description}</p>

            {selected.status !== 'resolvido' && (
              <div className="nx-stack nx-gap-3">
                <Select
                  label="Atribuir responsável"
                  options={ASSIGNEES.map((a) => ({ value: a, label: a }))}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                />
                <Button
                  variant="secondary"
                  icon={<UserPlus size={16} />}
                  onClick={() => {
                    assignTicket(selected.id, assignee, user.name);
                    refresh(selected.id);
                    toast.success('Chamado atribuído', `Responsável: ${assignee}`);
                  }}
                >
                  Atribuir
                </Button>
              </div>
            )}

            <div>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Histórico</p>
              <Timeline
                entries={selected.updates.map((u) => ({
                  id: u.id,
                  time: formatDateTime(u.at),
                  title: u.author,
                  description: u.message,
                  tone: u.status === 'resolvido' ? 'success' : u.status === 'em_andamento' ? 'brand' : 'neutral',
                  icon: u.status === 'resolvido' ? <CheckCircle2 size={15} /> : <MessageSquare size={15} />,
                }))}
              />
            </div>

            {selected.status !== 'resolvido' && (
              <div className="nx-stack nx-gap-3">
                <Textarea label="Registrar atualização" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Descreva o andamento..." />
                <div className="nx-row nx-gap-2 nx-wrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={message.trim().length < 3}
                    onClick={() => {
                      addTicketUpdate(selected.id, user.name, message.trim(), 'em_andamento');
                      setMessage('');
                      setSelected(null);
                      toast.success('Chamado atualizado');
                    }}
                  >
                    Registrar andamento
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={message.trim().length < 3}
                    onClick={() => {
                      addTicketUpdate(selected.id, user.name, message.trim(), 'resolvido');
                      setMessage('');
                      setSelected(null);
                      toast.success('Chamado encerrado', 'O morador foi notificado.');
                    }}
                  >
                    Encerrar chamado
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
