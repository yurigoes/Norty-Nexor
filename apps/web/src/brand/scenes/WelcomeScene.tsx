/**
 * Cena do morador — chegar em casa.
 *
 * O eixo emocional é o portal iluminado: a luz quente vem de dentro e se
 * derrama no caminho até quem olha. O restante do condomínio fica ao fundo,
 * em silhueta, com algumas janelas acesas. A única cor quente da plataforma
 * aparece aqui, e só aqui — é o que separa "acesso a um sistema" de
 * "chegar em casa".
 */
export function WelcomeScene({ className = '' }: { className?: string }) {
  const uid = 'ws';

  const windows: [number, number, number][] = [
    [300, 116, 0.5], [324, 116, 0.24], [300, 142, 0.34], [348, 142, 0.44],
    [324, 168, 0.2], [372, 116, 0.4], [820, 128, 0.46], [844, 152, 0.26],
    [820, 176, 0.4], [868, 128, 0.22],
  ];

  return (
    <svg
      viewBox="0 0 900 260"
      preserveAspectRatio="xMaxYMax slice"
      className={`nx-scene ${className}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}-doorway`} cx="0.5" cy="0.72" r="0.85">
          <stop stopColor="#FFF3DA" />
          <stop offset="0.5" stopColor="#FFD79A" />
          <stop offset="1" stopColor="#E8A15C" stopOpacity="0.62" />
        </radialGradient>
        <linearGradient id={`${uid}-spill`} x1="0" y1="196" x2="0" y2="260" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD79A" stopOpacity="0.5" />
          <stop offset="1" stopColor="#FFD79A" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-halo`} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#FFC97E" stopOpacity="0.34" />
          <stop offset="1" stopColor="#FFC97E" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-ground`} x1="0" y1="196" x2="0" y2="260" gradientUnits="userSpaceOnUse">
          <stop stopColor="#171A20" />
          <stop offset="1" stopColor="#0A0B0D" />
        </linearGradient>
      </defs>

      {/* Malha de conexões da marca, bem ao fundo */}
      <g opacity="0.28" stroke="#C9A227" strokeWidth="1" fill="#C9A227">
        <path d="M452 86 L556 58 L664 92 M556 58 L604 128 M664 92 L768 62" fill="none" />
        <circle cx="452" cy="86" r="3" /><circle cx="556" cy="58" r="4" />
        <circle cx="664" cy="92" r="3" /><circle cx="604" cy="128" r="2.5" />
        <circle cx="768" cy="62" r="3" />
      </g>

      {/* Torres ao fundo com janelas acesas — o condomínio esperando por você */}
      <g opacity="0.62">
        <rect x="286" y="98" width="104" height="102" rx="2" fill="#15181E" />
        <rect x="806" y="110" width="88" height="90" rx="2" fill="#12151A" />
        {windows.map(([x, y, o], i) => (
          <rect key={i} x={x} y={y} width="13" height="15" rx="2" fill="#FFD79A" opacity={o} />
        ))}
      </g>

      {/* Piso */}
      <rect x="0" y="196" width="900" height="64" fill={`url(#${uid}-ground)`} />
      <line x1="0" y1="196" x2="900" y2="196" stroke="#262A31" strokeWidth="1.4" />

      {/* Halo do portal */}
      <circle cx="648" cy="156" r="168" fill={`url(#${uid}-halo)`} />

      {/* Portal aberto — a luz vem de dentro */}
      <g>
        <path d="M580 200 L580 138 A68 68 0 0 1 716 138 L716 200 Z" fill="#0D0F13" />
        <path d="M592 200 L592 140 A56 56 0 0 1 704 140 L704 200 Z" fill={`url(#${uid}-doorway)`} />
        <path
          d="M580 200 L580 138 A68 68 0 0 1 716 138 L716 200"
          fill="none" stroke="#6E5C2E" strokeWidth="3"
        />
        {/* Piso interno visível pela porta aberta */}
        <rect x="592" y="188" width="112" height="12" fill="#FFE9C0" opacity="0.55" />
        {/* Batente: uma folha da porta recolhida */}
        <rect x="592" y="112" width="14" height="88" fill="#0D0F13" opacity="0.55" />
        {/* Luminária do hall */}
        <circle cx="648" cy="120" r="7" fill="#FFF3D8" />
        <path d="M641 120 L655 120 L662 156 L634 156 Z" fill="#FFE9C0" opacity="0.35" />
      </g>

      {/* Luz derramada no caminho */}
      <path d="M592 200 L704 200 L848 260 L448 260 Z" fill={`url(#${uid}-spill)`} />
      {/* Capacho na soleira */}
      <path d="M602 206 L694 206 L716 224 L580 224 Z" fill="#FFD79A" opacity="0.16" />

      {/* Vasos ladeando a entrada */}
      {[
        { x: 528, s: 0.92 },
        { x: 762, s: 0.8 },
      ].map(({ x, s }) => (
        <g key={x} transform={`translate(${x} 200) scale(${s})`} opacity="0.9">
          <path d="M-14 0 L14 0 L10 -26 L-10 -26 Z" fill="#20242B" />
          <path d="M0 -26 C -16 -46 -14 -66 0 -78 C 14 -66 16 -46 0 -26 Z" fill="#2E3A2C" />
          <path d="M0 -30 C -26 -40 -30 -56 -22 -66 C -6 -60 -2 -44 0 -30 Z" fill="#26302A" />
          <path d="M0 -30 C 26 -40 30 -56 22 -66 C 6 -60 2 -44 0 -30 Z" fill="#26302A" />
          <path d="M0 -32 C 8 -46 10 -60 4 -72" fill="none" stroke="#FFD79A" strokeOpacity="0.2" strokeWidth="1.5" />
        </g>
      ))}

      {/* Partículas quentes subindo — respiração da cena */}
      {[
        { x: 606, y: 176, r: 2.4, d: '0s' },
        { x: 668, y: 160, r: 1.8, d: '1.6s' },
        { x: 712, y: 182, r: 2, d: '3.1s' },
        { x: 586, y: 150, r: 1.6, d: '2.3s' },
      ].map((p) => (
        <circle
          key={`${p.x}-${p.y}`}
          className="nx-scene__mote"
          cx={p.x} cy={p.y} r={p.r}
          fill="#FFE0AE"
          style={{ animationDelay: p.d }}
        />
      ))}
    </svg>
  );
}
