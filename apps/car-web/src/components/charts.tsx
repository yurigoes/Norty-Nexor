/* =========================================================
   Gráficos em SVG puro, legíveis nos dois temas. Cores de
   série seguem a ordem fixa dos tokens --chart-N.
   ========================================================= */
import { useId } from 'react';

const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export interface Series { name: string; values: number[]; color?: string }

export function BarChart({ labels, series, height = 220, format = (v: number) => compact.format(v), stacked }: {
  labels: string[]; series: Series[]; height?: number; format?: (v: number) => string; stacked?: boolean;
}) {
  const id = useId();
  const width = 640;
  const pad = { top: 12, right: 8, bottom: 26, left: 48 };
  const totals = labels.map((_, i) => (stacked ? series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0) : Math.max(...series.map((s) => s.values[i] ?? 0))));
  const max = Math.max(1, ...totals);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const group = innerW / Math.max(1, labels.length);
  const barW = Math.max(4, Math.min(36, (group * 0.7) / (stacked ? 1 : series.length)));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  return (
    <figure style={{ margin: 0 }} aria-labelledby={`${id}-cap`}>
      <svg className="nc-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.map((s) => s.name).join(', ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
            <text x={pad.left - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {labels.map((label, i) => {
          const x0 = pad.left + group * i + (group - (stacked ? barW : barW * series.length)) / 2;
          let acc = 0;
          return (
            <g key={label + i}>
              {series.map((s, si) => {
                const v = Math.max(0, s.values[i] ?? 0);
                const x = stacked ? x0 : x0 + si * barW;
                const yTop = stacked ? y(acc + v) : y(v);
                const h = (stacked ? y(acc) : y(0)) - yTop;
                acc += v;
                return <rect key={s.name} x={x} y={yTop} width={barW - (stacked ? 0 : 2)} height={Math.max(0, h)} rx={3} fill={s.color ?? SERIES[si % SERIES.length]}><title>{`${label} — ${s.name}: ${format(v)}`}</title></rect>;
              })}
              <text x={pad.left + group * i + group / 2} y={height - 8} textAnchor="middle">{label}</text>
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption id={`${id}-cap`} className="nc-legend">
          {series.map((s, i) => <span key={s.name}><i style={{ background: s.color ?? SERIES[i % SERIES.length] }} />{s.name}</span>)}
        </figcaption>
      )}
    </figure>
  );
}

export function LineChart({ labels, series, height = 220, format = (v: number) => compact.format(v) }: {
  labels: string[]; series: Series[]; height?: number; format?: (v: number) => string;
}) {
  const width = 640;
  const pad = { top: 12, right: 12, bottom: 26, left: 48 };
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (labels.length <= 1 ? innerW / 2 : (innerW * i) / (labels.length - 1));
  const y = (v: number) => pad.top + innerH - ((v - min) / (top - min)) * innerH;
  return (
    <figure style={{ margin: 0 }}>
      <svg className="nc-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.map((s) => s.name).join(', ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
            <text x={pad.left - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const color = s.color ?? SERIES[si % SERIES.length];
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={color}><title>{`${labels[i]} — ${s.name}: ${format(v)}`}</title></circle>)}
            </g>
          );
        })}
        {labels.map((l, i) => (labels.length <= 12 || i % Math.ceil(labels.length / 12) === 0) && <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle">{l}</text>)}
      </svg>
      {series.length > 1 && (
        <figcaption className="nc-legend">
          {series.map((s, i) => <span key={s.name}><i style={{ background: s.color ?? SERIES[i % SERIES.length] }} />{s.name}</span>)}
        </figcaption>
      )}
    </figure>
  );
}

export function Donut({ data, size = 160, center }: { data: { label: string; value: number; color?: string }[]; size?: number; center?: React.ReactNode }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="row" style={{ gap: 'var(--space-5)', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={16} />
          {total > 0 && data.map((d, i) => {
            const len = (d.value / total) * c;
            const el = <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color ?? SERIES[i % SERIES.length]} strokeWidth={16} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{`${d.label}: ${d.value}`}</title></circle>;
            offset += len;
            return el;
          })}
        </svg>
        {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{center}</div>}
      </div>
      <ul className="nc-list" style={{ minWidth: 140 }}>
        {data.map((d, i) => (
          <li key={d.label} style={{ padding: '4px 0', border: 0 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: d.color ?? SERIES[i % SERIES.length], display: 'inline-block' }} aria-hidden />
            <span className="grow small">{d.label}</span>
            <span className="small strong tnum">{d.value.toLocaleString('pt-BR')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function niceTicks(max: number, count = 4): number[] {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}
