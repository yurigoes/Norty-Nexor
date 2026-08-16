import { useMemo, useState } from 'react';
import { Maximize2, Video, VideoOff } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { cameras } from '../../services/security';
import { CameraFeed } from '../../components/CameraFeed';
import type { Camera } from '../../data/types';
import { Badge, Card, Modal, PageHeader, SegmentedControl, StatCard } from '../../components/ui';
import './gate.css';

export function CamerasPage() {
  const { condominium, dataVersion } = useAuthenticated();
  const [layout, setLayout] = useState('grid');
  const [focused, setFocused] = useState<Camera | null>(null);

  const list = useMemo(() => cameras(condominium.id), [condominium.id, dataVersion]);
  const online = list.filter((c) => c.status === 'online');
  const motion = list.filter((c) => c.hasMotion && c.status === 'online');

  const visible = layout === 'motion' ? motion : layout === 'offline' ? list.filter((c) => c.status === 'offline') : list;

  return (
    <>
      <PageHeader
        icon={<Video size={22} />}
        title="Câmeras"
        subtitle="Monitoramento do perímetro e áreas comuns"
        actions={
          <SegmentedControl
            value={layout}
            onChange={setLayout}
            items={[
              { id: 'grid', label: `Todas (${list.length})` },
              { id: 'motion', label: `Movimento (${motion.length})` },
              { id: 'offline', label: `Offline (${list.length - online.length})` },
            ]}
          />
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Câmeras online" value={`${online.length}/${list.length}`} icon={<Video size={17} />} tone="success" />
        <StatCard label="Com movimento detectado" value={motion.length} icon={<Maximize2 size={17} />} tone="warning" />
        <StatCard label="Indisponíveis" value={list.length - online.length} icon={<VideoOff size={17} />} tone={online.length === list.length ? 'neutral' : 'danger'} />
      </div>

      <div className="nx-cam-grid">
        {visible.map((camera) => (
          <div
            key={camera.id}
            className={`nx-cam ${camera.status === 'offline' ? 'is-offline' : ''}`}
            onClick={() => camera.status === 'online' && setFocused(camera)}
          >
            <CameraFeed camera={camera} />
            <span className="nx-cam__tag">{camera.name}</span>
            {camera.status === 'online' && <span className="nx-cam__live">● AO VIVO</span>}
            <div className="nx-cam__meta">
              <div className="nx-stack">
                <span className="nx-cam__name">{camera.location}</span>
                <span className="nx-cam__location">Canal {camera.channel}</span>
              </div>
              {camera.hasMotion && camera.status === 'online' && <Badge tone="warning" size="sm">Movimento</Badge>}
              {camera.status === 'offline' && <Badge tone="danger" size="sm">Offline</Badge>}
            </div>
          </div>
        ))}
      </div>

      <Card padding="md" style={{ marginTop: 'var(--space-5)' }}>
        <p className="nx-medium">Sobre o CFTV nesta fase</p>
        <p className="nx-text-sm nx-text-muted" style={{ marginTop: 'var(--space-1)' }}>
          As imagens são simuladas e cada canal tem uma assinatura visual estável. A arquitetura
          já prevê a integração com ONVIF/RTSP na Fase 4 — o componente de vídeo é substituído
          sem alterar as telas.
        </p>
      </Card>

      <Modal
        open={focused !== null}
        onClose={() => setFocused(null)}
        title={focused?.location}
        subtitle={focused ? `${focused.name} · canal ${focused.channel}` : undefined}
        size="xl"
      >
        {focused && (
          <div className="nx-cam" style={{ cursor: 'default' }}>
            <CameraFeed camera={focused} />
            <span className="nx-cam__tag">{focused.name}</span>
            <span className="nx-cam__live">● AO VIVO</span>
          </div>
        )}
      </Modal>
    </>
  );
}
