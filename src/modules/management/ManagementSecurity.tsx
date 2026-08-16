import { useMemo } from 'react';
import {
  AlertTriangle, Car, DoorOpen, KeyRound, ShieldCheck, UserCheck, Video, Activity,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { accessesToday, gates, recentAccesses } from '../../services/access';
import { cameras } from '../../services/security';
import { onSite, expectedToday } from '../../services/visitors';
import { openIncidents } from '../../services/incidents';
import { unitLabel } from '../../services/directory';
import { CameraFeed } from '../../components/CameraFeed';
import { NexorMark } from '../../brand/NexorMark';
import {
  Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatusDot, Timeline,
} from '../../components/ui';
import { formatTime, isoDate, timeAgo } from '../../lib/date';
import { number } from '../../lib/format';
import '../gate/gate.css';
import './security.css';

export function ManagementSecurity() {
  const { condominium, dataVersion } = useAuthenticated();
  const today = isoDate(new Date());

  const data = useMemo(() => ({
    accesses: accessesToday(condominium.id, today),
    recent: recentAccesses(condominium.id, 10),
    cams: cameras(condominium.id),
    gateList: gates(condominium.id),
    inside: onSite(condominium.id),
    expected: expectedToday(condominium.id, today),
    incidents: openIncidents(condominium.id).slice(0, 6),
  }), [condominium.id, today, dataVersion]);

  const camsOnline = data.cams.filter((c) => c.status === 'online');
  const plateReads = data.accesses.filter((a) => a.method === 'placa');
  const denied = data.accesses.filter((a) => !a.authorized);

  return (
    <>
      <PageHeader
        icon={<ShieldCheck size={22} />}
        title="NEXOR Security"
        subtitle="Central de segurança: perímetro, câmeras, acessos e alertas"
        actions={<Button variant="secondary" to="/portaria/monitor" icon={<Video size={16} />}>Abrir modo monitor</Button>}
      />

      <section className="nx-security-hero">
        <div className="nx-security-hero__brand">
          <NexorMark size={40} variant="light" />
          <div>
            <p className="nx-uppercase" style={{ color: 'var(--nexor-cyan)' }}>Central de segurança</p>
            <h2>{condominium.name}</h2>
            <p className="nx-text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {condominium.address} · {condominium.city}/{condominium.state}
            </p>
          </div>
        </div>
        <div className="nx-security-hero__stats">
          <div><DoorOpen size={18} /><strong>{number(data.accesses.length)}</strong><span>Acessos hoje</span></div>
          <div><Car size={18} /><strong>{number(plateReads.length)}</strong><span>Leituras de placa</span></div>
          <div><UserCheck size={18} /><strong>{data.inside.length}</strong><span>Visitantes no local</span></div>
          <div><Video size={18} /><strong>{camsOnline.length}/{data.cams.length}</strong><span>Câmeras online</span></div>
          <div><AlertTriangle size={18} /><strong>{data.incidents.length}</strong><span>Ocorrências abertas</span></div>
          <div><Activity size={18} /><strong>{denied.length}</strong><span>Acessos negados</span></div>
        </div>
      </section>

      <div className="nx-security-grid">
        <Card padding="md">
          <CardHeader
            title="Monitoramento"
            subtitle={`${camsOnline.length} câmeras transmitindo`}
            action={<Button variant="ghost" size="sm" to="/portaria/cameras">Ver todas</Button>}
          />
          <div className="nx-cam-grid">
            {camsOnline.slice(0, 6).map((camera) => (
              <div key={camera.id} className="nx-cam" style={{ cursor: 'default' }}>
                <CameraFeed camera={camera} />
                <span className="nx-cam__tag">{camera.name}</span>
                <span className="nx-cam__live">● AO VIVO</span>
                <div className="nx-cam__meta">
                  <span className="nx-cam__name">{camera.location}</span>
                  {camera.hasMotion && <Badge tone="warning" size="sm">Movimento</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="nx-stack nx-gap-4">
          <Card padding="md">
            <CardHeader title="Perímetro" icon={<KeyRound size={18} />} action={<Button variant="ghost" size="sm" to="/portaria/portoes">Operar</Button>} />
            <div className="nx-stack nx-gap-2">
              {data.gateList.map((g) => (
                <div key={g.id} className="nx-gate-status">
                  <StatusDot tone={g.status === 'online' ? 'success' : g.status === 'manutencao' ? 'warning' : 'danger'} pulse={g.status === 'online'} />
                  <span className="nx-grow nx-medium">{g.name}</span>
                  <span className="nx-text-xs nx-text-subtle">
                    {g.lastOpenedAt ? timeAgo(g.lastOpenedAt) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <CardHeader title="Alertas de segurança" icon={<AlertTriangle size={18} />} action={<Button variant="ghost" size="sm" to="/gestao/ocorrencias">Ver todas</Button>} />
            {data.incidents.length === 0 ? (
              <EmptyState compact title="Nenhum alerta ativo" description="Nenhuma ocorrência de segurança em aberto." />
            ) : (
              <Timeline
                dense
                entries={data.incidents.map((i) => ({
                  id: i.id,
                  time: timeAgo(i.createdAt),
                  title: i.title,
                  description: `${i.code} · ${i.location}`,
                  tone: i.severity === 'critica' || i.severity === 'alta' ? 'danger' : 'warning',
                  icon: <AlertTriangle size={15} />,
                }))}
              />
            )}
          </Card>
        </div>

        <Card padding="md">
          <CardHeader title="Movimento em tempo real" subtitle="Últimos registros do perímetro" action={<Button variant="ghost" size="sm" to="/gestao/acessos">Histórico</Button>} />
          <ul className="nx-list">
            {data.recent.map((a) => (
              <li key={a.id} className="nx-list__item">
                <span className={`nx-list__icon ${!a.authorized ? 'nx-list__icon--danger' : a.direction === 'entrada' ? 'nx-list__icon--success' : ''}`}>
                  {a.plate ? <Car size={16} /> : <DoorOpen size={16} />}
                </span>
                <span className="nx-stack nx-grow">
                  <span className="nx-medium nx-truncate">{a.plate ?? a.subjectName}</span>
                  <span className="nx-text-xs nx-text-subtle">
                    {a.unitId ? unitLabel(a.unitId) : a.gateName} · {a.direction === 'entrada' ? 'entrada' : 'saída'}
                  </span>
                </span>
                <span className="nx-mono nx-text-sm nx-text-muted">{formatTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card padding="md" style={{ marginTop: 'var(--space-5)' }}>
        <p className="nx-medium">Integrações previstas</p>
        <p className="nx-text-sm nx-text-muted" style={{ marginTop: 'var(--space-1)' }}>
          A Fase 4 conecta a central a equipamentos reais: CFTV via ONVIF/RTSP, controladoras de
          acesso, cancelas, reconhecimento de placas (LPR) e biometria. Nesta fase, os fluxos e a
          arquitetura já estão completos — apenas as fontes de dados são simuladas.
        </p>
      </Card>
    </>
  );
}
