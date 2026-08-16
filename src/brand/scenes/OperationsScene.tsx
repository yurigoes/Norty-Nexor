/**
 * Cena da administradora — a operação em movimento.
 *
 * Engrenagens acopladas, cada uma numa cor da carteira, girando em sentidos
 * alternados como um trem de engrenagens real. Em volta, os condomínios
 * administrados aparecem como nós conectados ao mecanismo: o que a
 * administradora opera não é um prédio, é o conjunto.
 *
 * O caminho de cada engrenagem é calculado, não desenhado à mão — assim o
 * encaixe entre os dentes continua correto se os raios mudarem.
 */

interface Gear {
  cx: number;
  cy: number;
  teeth: number;
  radius: number;
  color: string;
  /** Sentido e velocidade: engrenagens acopladas giram em sentidos opostos. */
  spin: number;
}

const GEARS: Gear[] = [
  { cx: 668, cy: 132, teeth: 16, radius: 86, color: '#176BFF', spin: 26 },
  { cx: 800, cy: 76, teeth: 11, radius: 56, color: '#20D5E8', spin: -17 },
  { cx: 794, cy: 200, teeth: 10, radius: 54, color: '#7C5CFF', spin: -16 },
  { cx: 564, cy: 204, teeth: 8, radius: 40, color: '#10B981', spin: -12 },
];

/** Perfil de um dente: fração do passo em raiz, subida, topo e descida. */
function gearPath(teeth: number, radius: number): string {
  const root = radius * 0.78;
  const step = (Math.PI * 2) / teeth;
  const at = (angle: number, r: number) =>
    `${(Math.cos(angle) * r).toFixed(2)},${(Math.sin(angle) * r).toFixed(2)}`;

  const points: string[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    // Arco da raiz, amostrado para não achatar em engrenagens grandes.
    for (let k = 0; k <= 3; k += 1) points.push(at(a + step * 0.30 * (k / 3), root));
    points.push(at(a + step * 0.38, radius));
    for (let k = 0; k <= 2; k += 1) points.push(at(a + step * (0.38 + 0.24 * (k / 2)), radius));
    points.push(at(a + step * 0.70, root));
  }
  return `M${points.join(' L')} Z`;
}

export function OperationsScene({ className = '' }: { className?: string }) {
  const uid = 'os';

  /** Condomínios da carteira, ligados ao mecanismo que os opera. */
  const nodes: [number, number, number][] = [
    [452, 74, 4], [516, 108, 3], [470, 156, 3.5], [560, 62, 3],
    [538, 168, 3.5], [420, 122, 3], [494, 206, 3], [432, 196, 2.5],
  ];

  return (
    <svg
      viewBox="0 0 900 260"
      preserveAspectRatio="xMaxYMid slice"
      className={`nx-scene ${className}`}
      aria-hidden="true"
    >
      <defs>
        {GEARS.map((g, i) => (
          <linearGradient
            key={g.color}
            id={`${uid}-g${i}`}
            x1={-g.radius} y1={-g.radius}
            x2={g.radius} y2={g.radius}
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={g.color} />
            <stop offset="1" stopColor={g.color} stopOpacity="0.6" />
          </linearGradient>
        ))}
        <radialGradient id={`${uid}-glow`} cx="0.76" cy="0.5" r="0.55">
          <stop stopColor="#176BFF" stopOpacity="0.26" />
          <stop offset="1" stopColor="#176BFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="900" height="260" fill={`url(#${uid}-glow)`} />

      {/* Ligações entre a carteira e o mecanismo */}
      <g stroke="#20D5E8" strokeOpacity="0.3" strokeWidth="1" fill="none">
        <path d="M516 108 L584 118 M538 168 L590 148 M494 206 L564 204 M560 62 L612 92" />
        <path d="M452 74 L516 108 M452 74 L560 62 M470 156 L516 108 M470 156 L538 168 M420 122 L452 74 M420 122 L470 156 M432 196 L494 206 M494 206 L538 168" />
      </g>

      {nodes.map(([x, y, r], i) => (
        <circle
          key={i}
          className="nx-scene__node"
          cx={x} cy={y} r={r}
          fill={i % 3 === 0 ? '#20D5E8' : '#4A8BFF'}
          style={{ animationDelay: `${(i % 5) * 0.6}s` }}
        />
      ))}

      {/* Trem de engrenagens */}
      {GEARS.map((g, i) => (
        <g key={g.color} transform={`translate(${g.cx} ${g.cy})`}>
          <g
            className="nx-scene__gear"
            style={{ animationDuration: `${Math.abs(g.spin)}s`, animationDirection: g.spin < 0 ? 'reverse' : 'normal' }}
          >
            <path d={gearPath(g.teeth, g.radius)} fill={`url(#${uid}-g${i})`} />
            <circle r={g.radius * 0.5} fill="#08111F" opacity="0.55" />
            <circle r={g.radius * 0.5} fill="none" stroke={g.color} strokeWidth="2.5" strokeOpacity="0.8" />
            {/* Raios do cubo */}
            {[0, 1, 2, 3].map((k) => (
              <rect
                key={k}
                x={-g.radius * 0.06} y={-g.radius * 0.72}
                width={g.radius * 0.12} height={g.radius * 0.26}
                rx={g.radius * 0.05}
                fill={g.color}
                opacity="0.55"
                transform={`rotate(${k * 90})`}
              />
            ))}
          </g>
          <circle r={g.radius * 0.17} fill={g.color} opacity="0.9" />
        </g>
      ))}
    </svg>
  );
}
