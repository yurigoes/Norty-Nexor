/* =========================================================
   Mapa de avarias: o carro visto de cima, com as regiões de
   VEHICLE_REGIONS clicáveis (teclado incluso). Frente no topo.
   ========================================================= */
import { VEHICLE_REGIONS } from '@nortycar/shared';
import './operations.css';

type Shape = { d: string; label?: [number, number] };

/** Geometria em coordenadas 0..240 x 0..400. */
const SHAPES: Record<string, Shape> = {
  front_bumper: { d: 'M60 18 Q120 0 180 18 L176 40 Q120 30 64 40 Z', label: [120, 28] },
  hood: { d: 'M64 42 Q120 32 176 42 L170 110 L70 110 Z', label: [120, 80] },
  windshield: { d: 'M70 112 L170 112 L162 140 L78 140 Z' },
  roof: { d: 'M78 142 L162 142 L162 262 L78 262 Z', label: [120, 205] },
  rear_window: { d: 'M78 264 L162 264 L170 290 L70 290 Z' },
  trunk: { d: 'M70 292 L170 292 L176 352 Q120 362 64 352 Z', label: [120, 325] },
  rear_bumper: { d: 'M64 354 Q120 366 176 354 L180 378 Q120 396 60 378 Z', label: [120, 376] },
  left_front_fender: { d: 'M30 40 L62 42 L68 112 L30 112 Z' },
  left_front_door: { d: 'M30 114 L76 114 L76 200 L30 200 Z' },
  left_rear_door: { d: 'M30 202 L76 202 L76 286 L30 286 Z' },
  left_rear_fender: { d: 'M30 288 L68 290 L62 354 L30 352 Z' },
  right_front_fender: { d: 'M210 40 L178 42 L172 112 L210 112 Z' },
  right_front_door: { d: 'M210 114 L164 114 L164 200 L210 200 Z' },
  right_rear_door: { d: 'M210 202 L164 202 L164 286 L210 286 Z' },
  right_rear_fender: { d: 'M210 288 L172 290 L178 354 L210 352 Z' },
  left_mirror: { d: 'M6 120 L28 118 L28 138 L8 136 Z' },
  right_mirror: { d: 'M234 120 L212 118 L212 138 L232 136 Z' },
  wheel_fl: { d: 'M10 60 L28 60 L28 104 L10 104 Z' },
  wheel_fr: { d: 'M212 60 L230 60 L230 104 L212 104 Z' },
  wheel_rl: { d: 'M10 296 L28 296 L28 340 L10 340 Z' },
  wheel_rr: { d: 'M212 296 L230 296 L230 340 L212 340 Z' },
  interior: { d: 'M96 170 L144 170 L144 236 L96 236 Z', label: [120, 207] },
};

const SHORT: Record<string, string> = { front_bumper: 'Frente', hood: 'Capô', roof: 'Teto', trunk: 'Traseira', rear_bumper: 'Para-choque', interior: 'Interior' };

export function DamageMap({ damaged = [], newRegions = [], selected, onSelect, label = 'Mapa de avarias do veículo' }: {
  damaged?: string[]; newRegions?: string[]; selected?: string | null; onSelect?: (region: string) => void; label?: string;
}) {
  const interactive = Boolean(onSelect);
  return (
    <svg className="op-map" viewBox="0 0 240 400" role={interactive ? 'group' : 'img'} aria-label={label}>
      <rect className="body" x="28" y="10" width="184" height="380" rx="70" />
      {VEHICLE_REGIONS.map((r) => {
        const shape = SHAPES[r.key];
        if (!shape) return null;
        return (
          <g key={r.key}>
            <path
              className="region"
              d={shape.d}
              data-damaged={damaged.includes(r.key) || undefined}
              data-new={newRegions.includes(r.key) || undefined}
              data-selected={selected === r.key || undefined}
              tabIndex={interactive ? 0 : -1}
              role={interactive ? 'button' : undefined}
              aria-label={`${r.label}${damaged.includes(r.key) ? ' (com avaria)' : ''}`}
              aria-pressed={interactive ? selected === r.key : undefined}
              onClick={() => onSelect?.(r.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(r.key); } }}
            >
              <title>{r.label}</title>
            </path>
            {shape.label && SHORT[r.key] && <text x={shape.label[0]} y={shape.label[1]} textAnchor="middle">{SHORT[r.key]}</text>}
          </g>
        );
      })}
    </svg>
  );
}
