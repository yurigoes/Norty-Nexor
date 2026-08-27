import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, FileVideo, ImagePlus, Mic, Plus } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL, SEVERITY_LABEL, createIncident, incidentTone,
  incidentsOfUnit, severityTone,
} from '../../services/incidents';
import type { Incident, IncidentSeverity } from '../../data/types';
import {
  Badge, Button, Card, DataTable, Drawer, EmptyState, Input, Modal, PageHeader, Select,
  Textarea, Timeline, useToast, type Column,
} from '../../components/ui';
import { CellStack } from '../../components/PageBits';
import { formatDateTime } from '../../lib/date';
import { unitLabel } from '../../services/directory';

const TYPES = Object.entries(INCIDENT_TYPE_LABEL).map(([value, label]) => ({ value, label }));

export function ResidentIncidents() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const unitId = user.unitId!;

  const [formOpen, setFormOpen] = useState(params.get('novo') === '1');
  const [selected, setSelected] = useState<Incident | null>(null);

  const [type, setType] = useState<Incident['type']>('barulho');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('media');
  const [location, setLocation] = useState('');
  const [involved, setInvolved] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);

  useEffect(() => {
    if (params.get('novo') === '1') {
      setFormOpen(true);
      params.delete('novo');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const rows = useMemo(() => incidentsOfUnit(unitId), [unitId, dataVersion]);

  const toggleAttachment = (kind: string) => {
    setAttachments((prev) => prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]);
  };

  const submit = () => {
    if (title.trim().length < 4) { toast.error('Descreva a ocorrência', 'Informe um título válido.'); return; }
    const created = createIncident({
      condominiumId: condominium.id,
      unitId,
      type,
      title: title.trim(),
      description: description.trim() || title.trim(),
      severity,
      location: location.trim() || unitLabel(unitId),
      involved: involved.trim() ? involved.split(',').map((s) => s.trim()) : [],
      reportedBy: user.name,
      reporterRole: user.role,
      attachments: attachments.map((kind, i) => ({
        id: `att-${i}`,
        kind: kind as 'foto' | 'video' | 'audio',
        label: kind === 'foto' ? 'evidencia.jpg' : kind === 'video' ? 'video-ocorrencia.mp4' : 'audio-ocorrencia.m4a',
      })),
    });
    setFormOpen(false);
    setTitle(''); setDescription(''); setLocation(''); setInvolved(''); setAttachments([]);
    toast.success('Ocorrência registrada', `${created.code} foi encaminhada à administração.`);
  };

  const columns: Column<Incident>[] = [
    { key: 'title', header: 'Ocorrência', render: (i) => <CellStack title={i.title} meta={`${i.code} · ${INCIDENT_TYPE_LABEL[i.type]}`} /> },
    { key: 'location', header: 'Local', hideOnMobile: true, render: (i) => i.location },
    { key: 'severity', header: 'Severidade', hideOnMobile: true, render: (i) => <Badge tone={severityTone(i.severity)} size="sm">{SEVERITY_LABEL[i.severity]}</Badge> },
    { key: 'created', header: 'Registro', hideOnMobile: true, render: (i) => formatDateTime(i.createdAt) },
    { key: 'status', header: 'Status', align: 'right', render: (i) => <Badge tone={incidentTone(i.status)} size="sm">{INCIDENT_STATUS_LABEL[i.status]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<AlertTriangle size={22} />}
        title="Ocorrências"
        subtitle="Registro formal de eventos, danos e descumprimento de regras"
        actions={<Button variant="primary" icon={<Plus size={17} />} onClick={() => setFormOpen(true)}>Registrar ocorrência</Button>}
      />

      <Card padding="none">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(i) => i.id}
          onRowClick={setSelected}
          empty={
            <EmptyState
              icon={<AlertTriangle size={24} />}
              title="Nenhuma ocorrência registrada"
              description="Registre ocorrências com fotos, vídeos e áudios para formalizar o histórico junto à administração."
              action={<Button variant="primary" onClick={() => setFormOpen(true)}>Registrar ocorrência</Button>}
            />
          }
          mobileCard={(i) => (
            <div className="nx-stack nx-gap-2">
              <div className="nx-row nx-between nx-gap-2">
                <span className="nx-medium">{i.title}</span>
                <Badge tone={incidentTone(i.status)} size="sm">{INCIDENT_STATUS_LABEL[i.status]}</Badge>
              </div>
              <span className="nx-text-xs nx-text-subtle">{i.code} · {i.location}</span>
            </div>
          )}
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Registrar ocorrência"
        subtitle="O registro é auditável e fica disponível para a administração"
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
          <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Som alto após as 22h" autoFocus />
          <Input label="Local" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Torre A — 12º andar" />
          <Textarea label="Descrição" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o que aconteceu, quando e quem estava envolvido..." />
          <Input label="Envolvidos (opcional)" value={involved} onChange={(e) => setInvolved(e.target.value)} placeholder="Separe por vírgula" />

          <div className="nx-field">
            <label className="nx-field__label">Evidências</label>
            <div className="nx-row nx-gap-2 nx-wrap">
              <button type="button" className={`nx-attach ${attachments.includes('foto') ? 'is-active' : ''}`} onClick={() => toggleAttachment('foto')}>
                <ImagePlus size={16} /> Foto
              </button>
              <button type="button" className={`nx-attach ${attachments.includes('video') ? 'is-active' : ''}`} onClick={() => toggleAttachment('video')}>
                <FileVideo size={16} /> Vídeo
              </button>
              <button type="button" className={`nx-attach ${attachments.includes('audio') ? 'is-active' : ''}`} onClick={() => toggleAttachment('audio')}>
                <Mic size={16} /> Áudio
              </button>
            </div>
            <span className="nx-field__hint">No MVP o upload é simulado; a estrutura de anexos já está no modelo de dados.</span>
          </div>
        </div>
      </Modal>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title}
        subtitle={selected ? `${selected.code} · ${INCIDENT_TYPE_LABEL[selected.type]}` : undefined}
        footer={<Button variant="ghost" block onClick={() => setSelected(null)}>Fechar</Button>}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <div className="nx-row nx-gap-2 nx-wrap">
              <Badge tone={incidentTone(selected.status)}>{INCIDENT_STATUS_LABEL[selected.status]}</Badge>
              <Badge tone={severityTone(selected.severity)}>{SEVERITY_LABEL[selected.severity]}</Badge>
            </div>
            <p className="nx-text-muted">{selected.description}</p>
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
              <p className="nx-uppercase nx-text-subtle" style={{ marginBottom: 'var(--space-3)' }}>Providências</p>
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
          </div>
        )}
      </Drawer>
    </>
  );
}
