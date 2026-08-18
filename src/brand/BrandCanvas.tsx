/**
 * Composição visual abstrata da marca — malha de conexões e módulos
 * arquitetônicos em dourado sobre preto. Usada como fundo do login e das
 * telas de destaque. Deliberadamente não figurativa: nenhuma fotografia
 * de prédio.
 */
export function BrandCanvas({ className = '' }: { className?: string }) {
  const nodes = [
    [120, 90], [300, 60], [470, 130], [90, 250], [260, 220], [430, 300],
    [140, 400], [330, 380], [500, 450], [220, 530], [400, 560], [80, 590],
  ];
  const links: [number, number][] = [
    [0, 1], [1, 2], [0, 3], [0, 4], [1, 4], [2, 5], [4, 5], [3, 6], [4, 7],
    [5, 8], [6, 7], [7, 8], [6, 9], [7, 10], [9, 10], [9, 11], [3, 4], [8, 10],
  ];

  return (
    <svg viewBox="0 0 560 640" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="bc-line" x1="0" y1="0" x2="560" y2="640" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C9A227" stopOpacity="0.8" />
          <stop offset="1" stopColor="#E0C368" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id="bc-glow" cx="0.32" cy="0.28" r="0.75">
          <stop stopColor="#C9A227" stopOpacity="0.24" />
          <stop offset="1" stopColor="#0A0B0D" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bc-glow2" cx="0.78" cy="0.82" r="0.6">
          <stop stopColor="#E0C368" stopOpacity="0.16" />
          <stop offset="1" stopColor="#0A0B0D" stopOpacity="0" />
        </radialGradient>
        <pattern id="bc-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="560" height="640" fill="url(#bc-grid)" />
      <rect width="560" height="640" fill="url(#bc-glow)" />
      <rect width="560" height="640" fill="url(#bc-glow2)" />

      {/* Módulos arquitetônicos abstratos */}
      <g opacity="0.5">
        <rect x="40" y="330" width="70" height="260" rx="6" fill="none" stroke="rgba(255,255,255,0.10)" />
        <rect x="128" y="270" width="70" height="320" rx="6" fill="none" stroke="rgba(255,255,255,0.10)" />
        <rect x="368" y="300" width="70" height="290" rx="6" fill="none" stroke="rgba(255,255,255,0.10)" />
        <rect x="456" y="360" width="70" height="230" rx="6" fill="none" stroke="rgba(255,255,255,0.10)" />
      </g>

      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a][0]} y1={nodes[a][1]}
          x2={nodes[b][0]} y2={nodes[b][1]}
          stroke="url(#bc-line)"
          strokeWidth="1.1"
          strokeOpacity="0.55"
        />
      ))}

      {nodes.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i % 4 === 0 ? 5.5 : 3.5} fill={i % 3 === 0 ? '#E0C368' : '#C9A227'} />
          {i % 4 === 0 && <circle cx={x} cy={y} r="13" fill="none" stroke="#C9A227" strokeOpacity="0.3" strokeWidth="1" />}
        </g>
      ))}
    </svg>
  );
}
