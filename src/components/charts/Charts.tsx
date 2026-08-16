/**
 * Gráficos NEXOR — SVG próprio, responsivo e alinhado aos tokens da marca.
 * Sem dependências externas: mantém o bundle leve e o controle visual total.
 */
import { useId, useMemo, useState } from 'react';

export interface Point {
  label: string;
  value: number;
}

export interface Series {
  name: string;
  color: string;
  points: Point[];
}

const AXIS = 'var(--border-subtle)';

function niceMax(v: number) {
  if (v <= 0) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

function toPath(values: number[], w: number, h: number, max: number, pad: number) {
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/* ------------------------------------------------------------------ */
/* Área / linha                                                        */
/* ------------------------------------------------------------------ */

export function AreaChart({
  series,
  height = 220,
  formatValue = (v: number) => v.toLocaleString('pt-BR'),
  showGrid = true,
}: {
  series: Series[];
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const pad = 28;
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const max = useMemo(
    () => niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p.value)), 1) * 1.15),
    [series],
  );
  const step = labels.length > 1 ? (width - pad * 2) / (labels.length - 1) : 0;

  return (
    <div className="nx-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.name} id={`${id}-g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.26" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {showGrid && [0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad + t * (height - pad * 2);
          return <line key={t} x1={pad} x2={width - pad} y1={y} y2={y} stroke={AXIS} strokeWidth="1" />;
        })}

        {series.map((s, i) => {
          const values = s.points.map((p) => p.value);
          const line = toPath(values, width, height, max, pad);
          const area = `${line} L${width - pad},${height - pad} L${pad},${height - pad} Z`;
          return (
            <g key={s.name}>
              <path d={area} fill={`url(#${id}-g${i})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}

        {hover !== null && (
          <line
            x1={pad + hover * step}
            x2={pad + hover * step}
            y1={pad - 8}
            y2={height - pad}
            stroke="var(--nexor-blue)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {hover !== null && series.map((s) => {
          const v = s.points[hover]?.value ?? 0;
          return (
            <circle
              key={s.name}
              cx={pad + hover * step}
              cy={height - pad - (v / max) * (height - pad * 2)}
              r="4.5"
              fill="var(--surface-card)"
              stroke={s.color}
              strokeWidth="2.5"
            />
          );
        })}

        {labels.map((_, i) => (
          <rect
            key={i}
            x={pad + i * step - step / 2}
            y={0}
            width={step || width}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      <div className="nx-chart__axis">
        {labels.map((l, i) => (
          <span key={`${l}-${i}`} className={hover === i ? 'is-active' : ''}>{l}</span>
        ))}
      </div>

      <div className="nx-chart__legend">
        {series.map((s) => (
          <span key={s.name} className="nx-chart__legend-item">
            <i style={{ background: s.color }} />
            {s.name}
            {hover !== null && <strong className="nx-nums">{formatValue(s.points[hover]?.value ?? 0)}</strong>}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barras verticais (agrupadas)                                        */
/* ------------------------------------------------------------------ */

export function BarChart({
  series,
  height = 220,
  formatValue = (v: number) => v.toLocaleString('pt-BR'),
}: {
  series: Series[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const max = niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p.value)), 1) * 1.1);
  const width = 640;
  const pad = 28;
  const groupWidth = (width - pad * 2) / Math.max(labels.length, 1);
  const barWidth = Math.min(22, (groupWidth * 0.68) / series.length);

  return (
    <div className="nx-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad + t * (height - pad * 2);
          return <line key={t} x1={pad} x2={width - pad} y1={y} y2={y} stroke={AXIS} strokeWidth="1" />;
        })}
        {labels.map((_, gi) => (
          <g key={gi} onMouseEnter={() => setHover(gi)} onMouseLeave={() => setHover(null)}>
            <rect x={pad + gi * groupWidth} y={0} width={groupWidth} height={height} fill={hover === gi ? 'rgba(23,107,255,0.04)' : 'transparent'} />
            {series.map((s, si) => {
              const v = s.points[gi]?.value ?? 0;
              const h = (v / max) * (height - pad * 2);
              const totalW = barWidth * series.length + 3 * (series.length - 1);
              const x = pad + gi * groupWidth + groupWidth / 2 - totalW / 2 + si * (barWidth + 3);
              return (
                <rect
                  key={s.name}
                  x={x}
                  y={height - pad - h}
                  width={barWidth}
                  height={Math.max(h, 2)}
                  rx="3"
                  fill={s.color}
                  opacity={hover === null || hover === gi ? 1 : 0.42}
                />
              );
            })}
          </g>
        ))}
      </svg>

      <div className="nx-chart__axis">
        {labels.map((l, i) => <span key={`${l}-${i}`} className={hover === i ? 'is-active' : ''}>{l}</span>)}
      </div>

      <div className="nx-chart__legend">
        {series.map((s) => (
          <span key={s.name} className="nx-chart__legend-item">
            <i style={{ background: s.color }} />
            {s.name}
            {hover !== null && <strong className="nx-nums">{formatValue(s.points[hover]?.value ?? 0)}</strong>}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rosca                                                               */
/* ------------------------------------------------------------------ */

export function DonutChart({
  data,
  size = 190,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="nx-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-sunken)" strokeWidth={thickness} />
          {data.map((d) => {
            const length = (d.value / total) * circumference;
            const el = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${length - 2} ${circumference - length + 2}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += length;
            return el;
          })}
        </g>
      </svg>
      {(centerValue || centerLabel) && (
        <div className="nx-donut__center">
          {centerValue && <strong className="nx-nums">{centerValue}</strong>}
          {centerLabel && <span>{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barras horizontais (ranking)                                        */
/* ------------------------------------------------------------------ */

export function RankBars({
  data,
  formatValue = (v: number) => v.toLocaleString('pt-BR'),
}: {
  data: { label: string; value: number; color?: string }[];
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="nx-rank">
      {data.map((d) => (
        <div key={d.label} className="nx-rank__row">
          <span className="nx-rank__label nx-truncate">{d.label}</span>
          <span className="nx-rank__track">
            <span
              className="nx-rank__fill"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? 'var(--gradient-brand)' }}
            />
          </span>
          <span className="nx-rank__value nx-nums">{formatValue(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  color = 'var(--nexor-blue)',
  height = 36,
  width = 120,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  const max = Math.max(...values, 1);
  const path = toPath(values, width, height, max * 1.15, 4);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="nx-sparkline">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
