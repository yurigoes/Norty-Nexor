/* =========================================================
   Visualizador de veículo.

   Contrato estável usado pelo catálogo interno, pelo site
   público e pelo portal. A implementação com Three.js (GLB,
   rotação 360°, zoom, pontos de interesse, troca de cor) é
   carregada sob demanda; sem arquivo 3D ou sem WebGL, cai
   para a galeria de fotos — nunca inventa um modelo.
   ========================================================= */
import { Car } from 'lucide-react';

export interface Hotspot { key: string; label: string; description?: string; position: [number, number, number] }

export interface Vehicle3DViewerProps {
  /** URL do arquivo .glb (link temporário ou público). Sem ele: galeria de fotos. */
  modelUrl?: string | null;
  /** URLs das fotos, na ordem de exibição. */
  photos?: string[];
  /** Nome exibido e usado no texto alternativo. */
  title: string;
  /** Configuração sem unidade disponível: aparência dessaturada e selo. */
  unavailable?: boolean;
  hotspots?: Hotspot[];
  /** Cor de pintura em hex, quando o modelo 3D tiver material de carroceria. */
  colorHex?: string | null;
  height?: number;
}

export function Vehicle3DViewer({ photos = [], title, unavailable, height = 320 }: Vehicle3DViewerProps) {
  const cover = photos[0];
  return (
    <div style={{ position: 'relative', height, borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface-sunken)', filter: unavailable ? 'grayscale(1) opacity(0.7)' : undefined }}>
      {cover ? <img src={cover} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-subtle)' }}><Car size={56} aria-label={title} /></div>
      )}
      {unavailable && <span className="nc-badge nc-badge--neutral" style={{ position: 'absolute', top: 12, left: 12 }}>Indisponível</span>}
    </div>
  );
}
