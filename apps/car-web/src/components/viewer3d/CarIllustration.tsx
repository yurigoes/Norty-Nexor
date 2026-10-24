/* =========================================================
   Ilustração do veículo em perspectiva (2,5D).

   Mesmo desenho da cena do login, parametrizado pela cor real
   da frota e pelo tipo de carroceria. Aparece quando o modelo
   ainda não tem foto: o carro entra em perspectiva, pisca os
   faróis e acompanha o mouse com uma leve inclinação 3D.
   Com "reduzir movimento", fica parado.
   ========================================================= */
import { useId, useRef, type PointerEvent } from 'react';
import './car-illustration.css';

export type BodyKind = 'car' | 'suv' | 'truck';

/** Cor de pintura a partir do nome cadastrado na unidade. */
const COLORS: [RegExp, string][] = [
  [/vermelh|vinho|bord/i, '#c8102e'],
  [/branc/i, '#eef1f5'],
  [/prat/i, '#b9bec7'],
  [/pret/i, '#22262e'],
  [/azul/i, '#1f4fb8'],
  [/cinz|grafit/i, '#7d8590'],
  [/verde/i, '#1e7f4f'],
  [/amarel|dourad/i, '#e0b21a'],
  [/laranj/i, '#e2681c'],
  [/marrom|bege/i, '#8a6a4f'],
];

export function paintFor(color: string | null | undefined): string {
  return COLORS.find(([re]) => re.test(color ?? ''))?.[1] ?? '#1677ff';
}

export function bodyKindFor(category: string | null | undefined, bodyType?: string | null): BodyKind {
  const text = `${category ?? ''} ${bodyType ?? ''}`;
  if (/caminh|cavalo|truck|carreta/i.test(text)) return 'truck';
  if (/suv|picape|pickup|utilit/i.test(text)) return 'suv';
  return 'car';
}

export function CarIllustration({ color, kind = 'car', title, unavailable, animate = true, height = 320 }: {
  color?: string | null; kind?: BodyKind; title: string; unavailable?: boolean; animate?: boolean; height?: number | string;
}) {
  const id = useId().replace(/:/g, '');
  const stage = useRef<HTMLDivElement>(null);
  const paint = paintFor(color);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = stage.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--tilt-y', `${x * 16}deg`);
    el.style.setProperty('--tilt-x', `${-y * 8}deg`);
  };
  const reset = () => {
    stage.current?.style.setProperty('--tilt-y', '0deg');
    stage.current?.style.setProperty('--tilt-x', '0deg');
  };
  return (
    <div className="car-illu" style={{ height }} data-unavailable={unavailable || undefined} data-animate={animate || undefined}
      onPointerMove={onMove} onPointerLeave={reset} role="img" aria-label={title}>
      <div className="car-illu__glow" aria-hidden />
      <div className="car-illu__road" aria-hidden />
      <div className="car-illu__stage" ref={stage} aria-hidden>
        <div className="car-illu__car">
          {kind === 'truck' ? <TruckArt id={id} paint={paint} /> : <CarArt id={id} paint={paint} tall={kind === 'suv'} />}
        </div>
      </div>
      {unavailable && <span className="car-illu__badge">Indisponível</span>}
    </div>
  );
}

function Defs({ id, paint }: { id: string; paint: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={paint} stopOpacity="0.82" />
        <stop offset="0.12" stopColor="#ffffff" stopOpacity="0.35" />
        <stop offset="0.2" stopColor={paint} />
        <stop offset="1" stopColor={paint} />
      </linearGradient>
      <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.32" />
      </linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a9c8f5" stopOpacity="0.9" />
        <stop offset="1" stopColor="#16223b" stopOpacity="0.96" />
      </linearGradient>
      <radialGradient id={`${id}-beam`} cx="0" cy="0.5" r="1">
        <stop offset="0" stopColor="#fff6d6" stopOpacity="0.9" />
        <stop offset="1" stopColor="#fff6d6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#000" stopOpacity="0.45" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function Wheel({ cx, cy = 150, r = 30 }: { cx: number; cy?: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#0d1018" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a3349" strokeWidth="3" />
      <g className="car-illu__wheel" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={cy} r={r * 0.57} fill="#c9d0dc" />
        {[0, 72, 144, 216, 288].map((a) => (
          <rect key={a} x={cx - 2} y={cy - r * 0.53} width="4" height={r * 0.47} rx="2" fill="#7d8aa8" transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.17} fill="#5b667d" />
      </g>
    </g>
  );
}

function CarArt({ id, paint, tall }: { id: string; paint: string; tall: boolean }) {
  // SUV: mesmo desenho, mais alto e com rodas maiores.
  const lift = tall ? 10 : 0;
  return (
    <svg viewBox="0 0 520 200" className="car-illu__svg">
      <Defs id={id} paint={paint} />
      <ellipse cx="258" cy="180" rx="220" ry="13" fill={`url(#${id}-shadow)`} />
      <path className="car-illu__beam" d="M455 112 L520 76 L520 152 Z" fill={`url(#${id}-beam)`} />
      <g transform={`translate(0 ${-lift}) scale(1 ${tall ? 1.06 : 1})`} style={{ transformOrigin: '260px 152px' }}>
        <path d="M40 132 C40 112 52 104 78 100 L150 92 C176 62 206 46 258 44 L318 44 C356 44 380 58 408 86 L452 96 C474 100 486 110 488 126 L490 140 C490 148 484 152 476 152 L52 152 C44 152 40 146 40 138 Z" fill={`url(#${id}-body)`} />
        <path d="M40 132 C40 112 52 104 78 100 L150 92 C176 62 206 46 258 44 L318 44 C356 44 380 58 408 86 L452 96 C474 100 486 110 488 126 L490 140 C490 148 484 152 476 152 L52 152 C44 152 40 146 40 138 Z" fill={`url(#${id}-shade)`} />
        <path d="M70 118 L470 118" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="2" />
        <path d="M168 92 C190 68 214 58 252 57 L262 57 L262 92 Z" fill={`url(#${id}-glass)`} />
        <path d="M272 57 L314 57 C342 57 362 68 384 92 L272 92 Z" fill={`url(#${id}-glass)`} />
        <rect x="263" y="56" width="8" height="37" fill="#0b1220" opacity="0.55" />
        <rect x="300" y="104" width="22" height="4" rx="2" fill="#0b1220" opacity="0.4" />
        <path d="M384 90 L398 84 L404 92 L390 96 Z" fill={paint} stroke="#0b1220" strokeOpacity="0.3" />
        <rect x="40" y="110" width="12" height="14" rx="3" fill="#e5322d" />
        <path d="M466 104 L486 110 L488 122 L466 120 Z" fill="#e4ecfb" />
        <path className="car-illu__light" d="M466 104 L486 110 L488 122 L466 120 Z" fill="#fff6c2" />
        <circle className="car-illu__lamp" cx="480" cy="114" r="20" fill="#fff6c2" />
        <rect x="436" y="134" width="54" height="8" rx="4" fill="#0b1220" opacity="0.45" />
        <rect x="40" y="134" width="44" height="8" rx="4" fill="#0b1220" opacity="0.45" />
      </g>
      <Wheel cx={128} cy={150} r={tall ? 33 : 30} />
      <Wheel cx={400} cy={150} r={tall ? 33 : 30} />
    </svg>
  );
}

function TruckArt({ id, paint }: { id: string; paint: string }) {
  return (
    <svg viewBox="0 0 620 220" className="car-illu__svg">
      <Defs id={id} paint={paint} />
      <ellipse cx="310" cy="200" rx="290" ry="13" fill={`url(#${id}-shadow)`} />
      <path className="car-illu__beam" d="M592 140 L620 116 L620 176 Z" fill={`url(#${id}-beam)`} />
      {/* Baú */}
      <rect x="20" y="30" width="400" height="128" rx="6" fill="#eef1f5" />
      <rect x="20" y="30" width="400" height="128" rx="6" fill={`url(#${id}-shade)`} />
      {[70, 120, 170, 220, 270, 320, 370].map((x) => <rect key={x} x={x} y="36" width="3" height="116" fill="#c9cfd9" />)}
      <rect x="20" y="152" width="420" height="10" rx="3" fill="#2a3040" />
      {/* Cabine */}
      <path d="M440 44 L548 44 C566 44 576 56 580 72 L592 132 C594 146 590 164 576 164 L440 164 Z" fill={`url(#${id}-body)`} />
      <path d="M440 44 L548 44 C566 44 576 56 580 72 L592 132 C594 146 590 164 576 164 L440 164 Z" fill={`url(#${id}-shade)`} />
      <path d="M520 58 L552 58 C562 58 568 66 571 76 L578 108 L520 108 Z" fill={`url(#${id}-glass)`} />
      <rect x="452" y="64" width="56" height="44" rx="4" fill={`url(#${id}-glass)`} />
      <rect x="586" y="120" width="8" height="34" rx="2" fill="#c9d0dc" />
      <path d="M584 132 L594 134 L594 146 L584 146 Z" fill="#e4ecfb" />
      <path className="car-illu__light" d="M584 132 L594 134 L594 146 L584 146 Z" fill="#fff6c2" />
      <circle className="car-illu__lamp" cx="590" cy="140" r="20" fill="#fff6c2" />
      <rect x="20" y="118" width="10" height="16" rx="2" fill="#e5322d" />
      <rect x="456" y="48" width="4" height="30" rx="2" fill="#2a3040" />
      <Wheel cx={78} cy={172} r={28} />
      <Wheel cx={142} cy={172} r={28} />
      <Wheel cx={380} cy={172} r={28} />
      <Wheel cx={536} cy={172} r={28} />
    </svg>
  );
}
