import { useMemo, useState } from 'react';
import { Megaphone, Pin, Plus, Send } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  ANNOUNCEMENT_PRIORITY_LABEL, announcementTone, announcements, markAnnouncementRead,
  publishAnnouncement,
} from '../../services/communication';
import { towers } from '../../services/directory';
import type { Announcement } from '../../data/types';
import {
  Badge, Button, Card, Drawer, EmptyState, Input, Modal, PageHeader, SearchInput, Select,
  Switch, Tabs, Textarea, useToast,
} from '../../components/ui';
import { FilterBar } from '../../components/PageBits';
import { formatDateTime, timeAgo } from '../../lib/date';

export function AnnouncementsPage() {
  const { user, condominium, can, dataVersion } = useAuthenticated();
  const toast = useToast();
  const canPublish = can('announcements.publish');

  const [tab, setTab] = useState('todos');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Announcement['priority']>('normal');
  const [audience, setAudience] = useState('todos');
  const [pinned, setPinned] = useState(false);

  const all = useMemo(() => announcements(condominium.id), [condominium.id, dataVersion]);
  const condoTowers = useMemo(() => towers(condominium.id), [condominium.id, dataVersion]);

  const rows = useMemo(() => {
    const byTab = tab === 'todos' ? all : all.filter((a) => a.priority === tab);
    const q = term.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((a) => [a.title, a.body].some((f) => f.toLowerCase().includes(q)));
  }, [all, tab, term]);

  const submit = () => {
    if (title.trim().length < 4) { toast.error('Informe um título válido'); return; }
    const tower = condoTowers.find((t) => t.id === audience);
    publishAnnouncement({
      condominiumId: condominium.id,
      title: title.trim(),
      body: body.trim() || title.trim(),
      priority,
      audience: tower
        ? { kind: 'torre', ids: [tower.id], label: tower.name }
        : { kind: 'todos', label: 'Todos os moradores' },
      author: `${user.name} · ${user.role === 'sindico' ? 'Síndica' : 'Administração'}`,
      pinned,
    });
    setFormOpen(false);
    setTitle(''); setBody(''); setPriority('normal'); setAudience('todos'); setPinned(false);
    toast.success('Comunicado publicado', 'Todos os destinatários foram notificados.');
  };

  return (
    <>
      <PageHeader
        icon={<Megaphone size={22} />}
        title="Comunicados"
        subtitle={`Avisos oficiais do ${condominium.shortName}`}
        actions={canPublish ? <Button variant="primary" icon={<Plus size={17} />} onClick={() => setFormOpen(true)}>Novo comunicado</Button> : undefined}
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'todos', label: 'Todos', count: all.length },
              { id: 'urgente', label: 'Urgentes', count: all.filter((a) => a.priority === 'urgente').length },
              { id: 'importante', label: 'Importantes', count: all.filter((a) => a.priority === 'importante').length },
              { id: 'normal', label: 'Informativos', count: all.filter((a) => a.priority === 'normal').length },
            ]}
          />
        }
      />

      <Card padding="none" className="nx-mb-4">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar comunicado..." />
        </FilterBar>
      </Card>

      {rows.length === 0 ? (
        <Card padding="md">
          <EmptyState icon={<Megaphone size={24} />} title="Nenhum comunicado" description="Os avisos publicados pela administração aparecem aqui." />
        </Card>
      ) : (
        <div className="nx-stack nx-gap-3">
          {rows.map((a) => (
            <Card
              key={a.id}
              padding="md"
              interactive
              onClick={() => { markAnnouncementRead(a.id, user.id); setSelected(a); }}
            >
              <div className="nx-row nx-between nx-gap-3 nx-wrap">
                <div className="nx-row nx-gap-2 nx-wrap">
                  {a.pinned && <Badge tone="brand" size="sm" icon={<Pin size={11} />}>Fixado</Badge>}
                  <Badge tone={announcementTone(a.priority)} size="sm">{ANNOUNCEMENT_PRIORITY_LABEL[a.priority]}</Badge>
                  <Badge tone="neutral" size="sm">{a.audience.label}</Badge>
                </div>
                <span className="nx-text-xs nx-text-subtle">{timeAgo(a.publishedAt)}</span>
              </div>
              <h3 className="nx-card__title" style={{ marginTop: 'var(--space-3)' }}>{a.title}</h3>
              <p className="nx-text-sm nx-text-muted nx-clamp-2" style={{ marginTop: 'var(--space-1)' }}>{a.body}</p>
              <p className="nx-text-xs nx-text-subtle" style={{ marginTop: 'var(--space-3)' }}>{a.author}</p>
            </Card>
          ))}
        </div>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title}
        subtitle={selected ? `${selected.author} · ${formatDateTime(selected.publishedAt)}` : undefined}
        footer={<Button variant="ghost" block onClick={() => setSelected(null)}>Fechar</Button>}
      >
        {selected && (
          <div className="nx-stack nx-gap-4">
            <div className="nx-row nx-gap-2 nx-wrap">
              <Badge tone={announcementTone(selected.priority)}>{ANNOUNCEMENT_PRIORITY_LABEL[selected.priority]}</Badge>
              <Badge tone="neutral">{selected.audience.label}</Badge>
            </div>
            <p style={{ lineHeight: 'var(--leading-normal)', whiteSpace: 'pre-line' }}>{selected.body}</p>
          </div>
        )}
      </Drawer>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Novo comunicado"
        subtitle="Todos os destinatários recebem notificação imediata"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" icon={<Send size={16} />} onClick={submit}>Publicar</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Manutenção programada dos elevadores" autoFocus />
          <Textarea label="Mensagem" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva o comunicado..." />
          <div className="nx-grid-2">
            <Select
              label="Destinatários"
              options={[{ value: 'todos', label: 'Todos os moradores' }, ...condoTowers.map((t) => ({ value: t.id, label: t.name }))]}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
            <Select
              label="Prioridade"
              options={Object.entries(ANNOUNCEMENT_PRIORITY_LABEL).map(([value, label]) => ({ value, label }))}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Announcement['priority'])}
            />
          </div>
          <Switch checked={pinned} onChange={setPinned} label="Fixar no topo" description="Comunicados fixados aparecem primeiro para todos os moradores." />
        </div>
      </Modal>
    </>
  );
}
