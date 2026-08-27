import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ImagePlus, MessageSquare, Plus, Wrench } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL, createTicket, priorityTone, ticketTone, ticketsOfUnit,
} from '../../services/tickets';
import { TICKET_CATEGORIES } from '../../data/seed/random';
import type { Ticket, TicketPriority } from '../../data/types';
import {
  Badge, Button, Card, DataTable, Drawer, EmptyState, Input, Modal, PageHeader, Select,
  Tabs, Textarea, Timeline, useToast, type Column,
} from '../../components/ui';
import { CellStack } from '../../components/PageBits';
import { formatDateTime, timeAgo } from '../../lib/date';
import { unitLabel } from '../../services/directory';

export function ResidentTickets() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const unitId = user.unitId!;

  const [tab, setTab] = useState('abertos');
  const [formOpen, setFormOpen] = useState(params.get('novo') === '1');
  const [selected, setSelected] = useState<Ticket | null>(null);

  const [category, setCategory] = useState('Manutenção');
  const [location, setLocation] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [attachment, setAttachment] = useState(false);

  useEffect(() => {
    if (params.get('novo') === '1') {
      setFormOpen(true);
      params.delete('novo');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const all = useMemo(() => ticketsOfUnit(unitId), [unitId, dataVersion]);
  const open = all.filter((t) => t.status === 'aberto' || t.status === 'em_andamento');
  const closed = all.filter((t) => t.status === 'resolvido' || t.status === 'cancelado');
  const rows = tab === 'abertos' ? open : closed;

  const submit = () => {
    if (title.trim().length < 4) { toast.error('Descreva o chamado', 'Informe um título com pelo menos 4 caracteres.'); return; }
    const created = createTicket({
      condominiumId: condominium.id,
      unitId,
      category,
      location: location.trim() || unitLabel(unitId),
      title: title.trim(),
      description: description.trim() || title.trim(),
      priority,
      openedBy: user.name,
      openedById: user.residentId,
      hasAttachment: attachment,
    });
    setFormOpen(false);
    setTitle(''); setDescription(''); setLocation(''); setPriority('normal'); setAttachment(false);
    setTab('abertos');
    toast.success('Chamado aberto', `${created.code} foi encaminhado para a administração.`);
  };

  const columns: Column<Ticket>[] = [
    { key: 'code', header: 'Chamado', render: (t) => <CellStack title={t.title} meta={`${t.code} · ${t.category}`} /> },
    { key: 'location', header: 'Local', hideOnMobile: true, render: (t) => t.location },
    { key: 'priority', header: 'Prioridade', hideOnMobile: true, render: (t) => <Badge tone={priorityTone(t.priority)} size="sm">{TICKET_PRIORITY_LABEL[t.priority]}</Badge> },
    { key: 'updated', header: 'Atualizado', hideOnMobile: true, render: (t) => timeAgo(t.updatedAt) },
    { key: 'status', header: 'Status', align: 'right', render: (t) => <Badge tone={ticketTone(t.status)} size="sm">{TICKET_STATUS_LABEL[t.status]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<Wrench size={22} />}
        title="Chamados"
        subtitle="Solicitações de manutenção e serviços"
        actions={<Button variant="primary" icon={<Plus size={17} />} onClick={() => setFormOpen(true)}>Abrir chamado</Button>}
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'abertos', label: 'Em andamento', count: open.length },
              { id: 'encerrados', label: 'Encerrados', count: closed.length },
            ]}
          />
        }
      />

      <Card padding="none">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(t) => t.id}
          onRowClick={setSelected}
          empty={
            <EmptyState
              icon={<Wrench size={24} />}
              title={tab === 'abertos' ? 'Nenhum chamado em andamento' : 'Nenhum chamado encerrado'}
              description="Abra um chamado para solicitar reparos, limpeza ou qualquer serviço do condomínio."
              action={<Button variant="primary" onClick={() => setFormOpen(true)}>Abrir chamado</Button>}
            />
          }
          mobileCard={(t) => (
            <div className="nx-stack nx-gap-2">
              <div className="nx-row nx-between nx-gap-2">
                <span className="nx-medium">{t.title}</span>
                <Badge tone={ticketTone(t.status)} size="sm">{TICKET_STATUS_LABEL[t.status]}</Badge>
              </div>
              <span className="nx-text-xs nx-text-subtle">{t.code} · {t.category} · {t.location}</span>
            </div>
          )}
        />
      </Card>

      {/* ---------- Novo chamado ---------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Abrir chamado"
        subtitle="A administração recebe a solicitação imediatamente"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submit}>Abrir chamado</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <div className="nx-grid-2">
            <Select
              label="Categoria"
              options={TICKET_CATEGORIES.map((c) => ({ value: c, label: c }))}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <Select
              label="Prioridade"
              options={[
                { value: 'baixa', label: 'Baixa' },
                { value: 'normal', label: 'Normal' },
                { value: 'alta', label: 'Alta' },
                { value: 'urgente', label: 'Urgente' },
              ]}
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            />
          </div>
          <Input label="Local" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={`Ex.: Corredor Torre B, ${unitLabel(unitId)}`} />
          <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Lâmpada queimada" autoFocus required />
          <Textarea label="Descrição" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o que está acontecendo..." />
          <button type="button" className={`nx-upload ${attachment ? 'is-filled' : ''}`} onClick={() => setAttachment((v) => !v)}>
            <ImagePlus size={20} />
            <span>{attachment ? 'foto-chamado.jpg anexada · clique para remover' : 'Anexar foto (opcional)'}</span>
          </button>
        </div>
      </Modal>

      {/* ---------- Detalhe ---------- */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title}
        subtitle={selected ? `${selected.code} · ${selected.category}` : undefined}
        footer={<Button variant="ghost" block onClick={() => setSelected(null)}>Fechar</Button>}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <div className="nx-row nx-gap-2 nx-wrap">
              <Badge tone={ticketTone(selected.status)}>{TICKET_STATUS_LABEL[selected.status]}</Badge>
              <Badge tone={priorityTone(selected.priority)}>{TICKET_PRIORITY_LABEL[selected.priority]}</Badge>
              {selected.assignedTo && <Badge tone="neutral">{selected.assignedTo}</Badge>}
            </div>
            <p className="nx-text-muted">{selected.description}</p>
            <div>
              <p className="nx-uppercase nx-text-subtle" style={{ marginBottom: 'var(--space-3)' }}>Acompanhamento</p>
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
          </div>
        )}
      </Drawer>
    </>
  );
}
