import { useMemo, useState } from 'react';
import { AlertTriangle, FileVideo, ImagePlus, Mic, Plus } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL, SEVERITY_LABEL, addIncidentAction, createIncident,
  incidentTone, incidents, severityTone,
} from '../../services/incidents';
import { unitLabel, units } from '../../services/directory';
import type { Incident, IncidentSeverity, IncidentStatus } from '../../data/types';
import {
  Badge, Button, Card, DataTable, Drawer, EmptyState, Input, Modal, PageHeader, SearchInput,
  Select, StatCard, Tabs, Textarea, Timeline, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDateTime, timeAgo } from '../../lib/date';

const TYPES = Object.entries(INCIDENT_TYPE_LABEL).map(([value, label]) => ({ value, label }));

/** Módulo de ocorrências compartilhado entre portaria e gestão. */
export function IncidentsBoard({ subtitle }: { subtitle: string }) {
  const { user, condominium, can, dataVersion } = useAuthenticated();
  const toast = useToast();
  const canManage = can('incidents.manage');

  const [tab, setTab] = useState('abertas');
  const [term, setTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [action, setAction] = useState('');

  const [type, setType] = useState<Incident['type']>('seguranca');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('media');
  const [location, setLocation] = useState('');
  const [unitId, setUnitId] = useState('');
  const [involved, setInvolved] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);

  const all = useMemo(() => incidents(condominium.id), [condominium.id, dataVersion]);
  const open = all.filter((i) => i.status !== 'encerrada');
  const closed = all.filter((i) => i.status === 'encerrada');

  const unitOptions = useMemo(
    () => units(condominium.id).slice(0, 200).map((u) => ({ value: u.id, label: `Torre ${u.block} · Apto ${u.label}` })),
    [condominium.id, dataVersion],
  );

  const rows = useMemo(() => {
    const base = tab === 'abertas' ? open : closed;
    const q = term.trim().toLowerCase();
    return base.filter((i) =>
      (!q || [i.title, i.code, i.location, i.reportedBy].some((f) => f.toLowerCase().includes(q)))
      && (!severityFilter || i.severity === severityFilter)).slice(0, 200);
  }, [tab, open, closed, term, severityFilter]);

  const submit = () => {
    if (title.trim().length < 4) { toast.error('Informe um título válido'); return; }
    const created = createIncident({
      condominiumId: condominium.id,
      unitId: unitId || undefined,
      type,
      title: title.trim(),
      description: description.trim() || title.trim(),
      severity,
      location: location.trim() || 'Áreas comuns',
      involved: involved.trim() ? involved.split(',').map((s) => s.trim()) : [],
      reportedBy: user.name,
      reporterRole: user.role,
      attachments: attachments.map((kind, i) => ({
        id: `att-${i}`,
        kind: kind as 'foto' | 'video' | 'audio',
        label: kind === 'foto' ? 'evidencia.jpg' : kind === 'video' ? 'video.mp4' : 'audio.m4a',
      })),
    });
    setFormOpen(false);
    setTitle(''); setDescription(''); setLocation(''); setInvolved(''); setUnitId(''); setAttachments([]);
    toast.success('Ocorrência registrada', `${created.code} encaminhada à administração.`);
  };

  const advance = (status: IncidentStatus) => {
    if (!selected || action.trim().length < 3) { toast.error('Descreva a providência adotada'); return; }
    addIncidentAction(selected.id, user.name, action.trim(), status);
    setAction('');
    setSelected(null);
    toast.success('Ocorrência atualizada', INCIDENT_STATUS_LABEL[status]);
  };

  const columns: Column<Incident>[] = [
    { key: 'title', header: 'Ocorrência', render: (i) => <CellStack title={i.title} meta={`${i.code} · ${INCIDENT_TYPE_LABEL[i.type]}`} /> },
    { key: 'location', header: 'Local', hideOnMobile: true, render: (i) => <CellStack title={i.location} meta={i.unitId ? unitLabel(i.unitId) : '—'} /> },
    { key: 'severity', header: 'Severidade', render: (i) => <Badge tone={severityTone(i.severity)} size="sm">{SEVERITY_LABEL[i.severity]}</Badge> },
    { key: 'reporter', header: 'Registrada por', hideOnMobile: true, render: (i) => <CellStack title={i.reportedBy} meta={timeAgo(i.createdAt)} /> },
    { key: 'status', header: 'Status', align: 'right', render: (i) => <Badge tone={incidentTone(i.status)} size="sm">{INCIDENT_STATUS_LABEL[i.status]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<AlertTriangle size={22} />}
        title="Ocorrências"
        subtitle={subtitle}
        actions={<Button variant="primary" icon={<Plus size={17} />} onClick={() => setFormOpen(true)}>Registrar ocorrência</Button>}
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'abertas', label: 'Em aberto', count: open.length },
              { id: 'encerradas', label: 'Encerradas', count: closed.length },
            ]}
          />
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Em aberto" value={open.length} icon={<AlertTriangle size={17} />} tone="warning" />
        <StatCard label="Alta severidade" value={open.filter((i) => i.severity === 'alta' || i.severity === 'critica').length} icon={<AlertTriangle size={17} />} tone="danger" />
        <StatCard label="Encerradas" value={closed.length} icon={<AlertTriangle size={17} />} tone="success" />
        <StatCard label="Registradas em 30 dias" value={all.filter((i) => Date.now() - new Date(i.createdAt).getTime() < 30 * 86400000).length} icon={<AlertTriangle size={17} />} tone="neutral" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar por título, código ou local..." />
          <Select
            options={Object.entries(SEVERITY_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="Todas as severidades"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            selectSize="sm"
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(i) => i.id}
          onRowClick={setSelected}
          empty={<EmptyState icon={<AlertTriangle size={24} />} title="Nenhuma ocorrência" description="Registre ocorrências para formalizar o histórico do condomínio." />}
          mobileCard={(i) => (
            <div className="nx-stack nx-gap-2">
              <div className="nx-row nx-between nx-gap-2">
                <span className="nx-medium">{i.title}</span>
                <Badge tone={incidentTone(i.status)} size="sm">{INCIDENT_STATUS_LABEL[i.status]}</Badge>
              </div>
              <span className="nx-text-xs nx-text-subtle">{i.code} · {i.location} · {timeAgo(i.createdAt)}</span>
            </div>
          )}
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Registrar ocorrência"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submit}>Registrar</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <div className="nx-grid-2">
            <Select label="Tipo" options={TYPES} value={type} onChange={(e) => setType(e.target.value as Incident['type'])} />
            <Select
              label="Severidade"
              options={Object.entries(SEVERITY_LABEL).map(([value, label]) => ({ value, label }))}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            />
          </div>
          <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Ex.: Pessoa não identificada no subsolo" />
          <div className="nx-grid-2">
            <Input label="Local" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Garagem S1" />
            <Select label="Unidade relacionada" options={unitOptions} placeholder="Sem unidade" value={unitId} onChange={(e) => setUnitId(e.target.value)} />
          </div>
          <Textarea label="Descrição" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input label="Envolvidos" value={involved} onChange={(e) => setInvolved(e.target.value)} placeholder="Separe por vírgula" />
          <div className="nx-field">
            <label className="nx-field__label">Evidências</label>
            <div className="nx-row nx-gap-2 nx-wrap">
              {[['foto', ImagePlus], ['video', FileVideo], ['audio', Mic]].map(([kind, Icon]) => {
                const K = Icon as typeof ImagePlus;
                return (
                  <button
                    key={kind as string}
                    type="button"
                    className={`nx-attach ${attachments.includes(kind as string) ? 'is-active' : ''}`}
                    onClick={() => setAttachments((p) => p.includes(kind as string) ? p.filter((x) => x !== kind) : [...p, kind as string])}
                  >
                    <K size={16} /> {kind === 'foto' ? 'Foto' : kind === 'video' ? 'Vídeo' : 'Áudio'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <Drawer
        open={selected !== null}
        onClose={() => { setSelected(null); setAction(''); }}
        title={selected?.title}
        subtitle={selected ? `${selected.code} · ${INCIDENT_TYPE_LABEL[selected.type]}` : undefined}
        width={520}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <div className="nx-row nx-gap-2 nx-wrap">
              <Badge tone={incidentTone(selected.status)}>{INCIDENT_STATUS_LABEL[selected.status]}</Badge>
              <Badge tone={severityTone(selected.severity)}>{SEVERITY_LABEL[selected.severity]}</Badge>
              <Badge tone="neutral">{selected.location}</Badge>
            </div>
            <p className="nx-text-muted">{selected.description}</p>
            {selected.involved.length > 0 && (
              <p className="nx-text-sm"><strong>Envolvidos:</strong> {selected.involved.join(', ')}</p>
            )}
            {selected.attachments.length > 0 && (
              <div className="nx-row nx-gap-2 nx-wrap">
                {selected.attachments.map((a) => (
                  <span key={a.id} className="nx-attach is-static">
                    {a.kind === 'foto' ? <ImagePlus size={15} /> : a.kind === 'video' ? <FileVideo size={15} /> : <Mic size={15} />}
                    {a.label}
                  </span>
                ))}
              </div>
            )}

            <div>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Providências</p>
              <Timeline
                entries={selected.actions.map((a) => ({
                  id: a.id,
                  time: formatDateTime(a.at),
                  title: a.author,
                  description: a.message,
                  tone: 'brand',
                }))}
              />
            </div>

            {canManage && selected.status !== 'encerrada' && (
              <div className="nx-stack nx-gap-3">
                <Textarea label="Registrar providência" rows={3} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Descreva a ação adotada..." />
                <div className="nx-row nx-gap-2 nx-wrap">
                  <Button variant="secondary" size="sm" onClick={() => advance('em_analise')}>Em análise</Button>
                  <Button variant="secondary" size="sm" onClick={() => advance('notificada')}>Notificar unidade</Button>
                  <Button variant="success" size="sm" onClick={() => advance('encerrada')}>Encerrar ocorrência</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
