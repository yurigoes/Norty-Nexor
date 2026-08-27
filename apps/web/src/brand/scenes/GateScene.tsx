/**
 * Cena da portaria — guarita noturna.
 *
 * Compõe o que o porteiro reconhece do próprio posto: a guarita iluminada
 * com alguém de plantão, a cancela baixada sobre a via e o perímetro. O
 * fundo é quase preto e a única cor viva é o ciano da marca nos sinais
 * ativos — a leitura pretendida é "há alguém cuidando disto agora", não
 * "alarme".
 *
 * Composição: o título ocupa a faixa esquerda, então tudo o que precisa ser
 * visto fica da metade para a direita. E como a faixa é mais baixa que a
 * arte, o conteúdo essencial mora abaixo de y=90 — o topo pode ser cortado
 * sem perda.
 */
export function GateScene({ className = '' }: { className?: string }) {
  const uid = 'gs';

  /** Janelas acesas das torres ao fundo, em posições fixas. */
  const windows: [number, number, number][] = [
    [248, 118, 0.34], [268, 118, 0.16], [248, 142, 0.22], [288, 142, 0.3],
    [268, 166, 0.14], [330, 130, 0.26], [350, 154, 0.16], [330, 178, 0.24],
  ];

  return (
    <svg
      viewBox="0 0 900 260"
      preserveAspectRatio="xMaxYMax slice"
      className={`nx-scene ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="260" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16181D" />
          <stop offset="0.6" stopColor="#0E1013" />
          <stop offset="1" stopColor="#06070A" />
        </linearGradient>
        <linearGradient id={`${uid}-ground`} x1="0" y1="198" x2="0" y2="260" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1B1E24" />
          <stop offset="1" stopColor="#0A0B0E" />
        </linearGradient>
        <radialGradient id={`${uid}-lamp`} cx="0.5" cy="0" r="1">
          <stop stopColor="#FFE2B0" stopOpacity="0.24" />
          <stop offset="1" stopColor="#FFE2B0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-window`} x1="0" y1="118" x2="0" y2="176" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF0D2" />
          <stop offset="1" stopColor="#FFC97E" />
        </linearGradient>
        <linearGradient id={`${uid}-spill`} x1="0" y1="200" x2="0" y2="260" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD9A0" stopOpacity="0.26" />
          <stop offset="1" stopColor="#FFD9A0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#C9A227" stopOpacity="0" />
          <stop offset="0.5" stopColor="#C9A227" stopOpacity="0.14" />
          <stop offset="1" stopColor="#C9A227" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="900" height="260" fill={`url(#${uid}-sky)`} />

      {/* Torres do condomínio ao fundo — contexto, não protagonismo */}
      <g opacity="0.75">
        <rect x="234" y="96" width="96" height="104" fill="#0E1B2B" />
        <rect x="318" y="112" width="76" height="88" fill="#0C1725" />
        {windows.map(([x, y, o], i) => (
          <rect key={i} x={x} y={y} width="11" height="13" rx="2" fill="#FFD9A0" opacity={o} />
        ))}
      </g>

      {/* Piso e perspectiva da via */}
      <rect x="0" y="198" width="900" height="62" fill={`url(#${uid}-ground)`} />
      <line x1="0" y1="198" x2="900" y2="198" stroke="#2A2E36" strokeWidth="1.4" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line
          key={i}
          x1={-200 + i * 250} y1="260"
          x2={330 + i * 68} y2="199"
          stroke="#1B2C3F" strokeWidth="1" strokeOpacity="0.6"
        />
      ))}

      {/* Cone de luz do poste */}
      <path d="M540 104 L616 200 L464 200 Z" fill={`url(#${uid}-lamp)`} />

      {/* Guarita, à direita, onde a faixa fica visível */}
      <g>
        <path d="M586 100 L772 100 L758 82 L600 82 Z" fill="#182B41" />
        <rect x="596" y="100" width="166" height="100" fill="#0F1E30" />
        <rect x="596" y="100" width="166" height="100" fill="none" stroke="#28405A" strokeWidth="1.4" />

        {/* Janela acesa: o porteiro de plantão diante do monitor */}
        <rect x="610" y="118" width="112" height="58" rx="3" fill={`url(#${uid}-window)`} />
        <g fill="#0C0E12">
          {/* Silhueta em perfil de três quartos, apoiada no balcão */}
          <circle cx="638" cy="139" r="10" opacity="0.9" />
          <path d="M620 172 C 621 156 628 150 638 150 C 648 150 655 156 656 172 Z" opacity="0.9" />
          {/* Monitor do posto, voltado para dentro */}
          <rect x="686" y="132" width="26" height="19" rx="2" opacity="0.55" />
          <rect x="696" y="151" width="6" height="5" opacity="0.55" />
        </g>
        <rect x="686" y="133" width="24" height="17" rx="1.5" fill="#C9A227" opacity="0.45" />
        {/* Balcão de atendimento */}
        <rect x="610" y="170" width="112" height="6" fill="#0C0E12" opacity="0.5" />
        <line x1="672" y1="118" x2="672" y2="170" stroke="#0C0E12" strokeOpacity="0.22" strokeWidth="2" />

        {/* Porta com sinaleiro de acesso */}
        <rect x="730" y="140" width="26" height="60" rx="2" fill="#0A1421" />
        <circle cx="735" cy="172" r="2" fill="#C9A227" opacity="0.8" />
        <rect x="592" y="198" width="174" height="6" rx="2" fill="#2A2E36" />
      </g>

      {/* Luz da janela derramada no chão */}
      <path d="M610 200 L722 200 L784 260 L552 260 Z" fill={`url(#${uid}-spill)`} />

      {/* Muro do perímetro à direita da guarita */}
      <g opacity="0.8">
        <rect x="778" y="150" width="122" height="50" fill="#101E2F" />
        {[788, 812, 836, 860, 884].map((x) => (
          <rect key={x} x={x} y="142" width="7" height="10" rx="2" fill="#1A2C40" />
        ))}
      </g>

      {/* Poste de iluminação */}
      <g>
        <rect x="536" y="106" width="7" height="94" rx="2" fill="#2A2E36" />
        <path d="M524 102 Q539 90 554 102 Z" fill="#33383F" />
        <circle cx="539" cy="103" r="6" fill="#FFE9C4" />
      </g>

      {/* Cancela baixada — acesso controlado */}
      <g>
        <rect x="486" y="140" width="18" height="60" rx="3" fill="#2A2E36" />
        <rect x="482" y="134" width="26" height="12" rx="3" fill="#33383F" />
        <circle cx="495" cy="128" r="4.5" fill="#C9A227" className="nx-scene__pulse" />
        <rect x="238" y="158" width="250" height="11" rx="5" fill="#D8D6D0" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} x={250 + i * 34} y="158" width="17" height="11" fill="#0C0E12" opacity="0.85" />
        ))}
        <rect x="232" y="146" width="8" height="54" rx="2" fill="#2A2E36" />
      </g>

      {/* Balizadores marcando a faixa de aproximação */}
      {[300, 344, 388].map((x) => (
        <g key={x}>
          <rect x={x} y="178" width="7" height="22" rx="3" fill="#2A2E36" />
          <rect x={x} y="180" width="7" height="4" fill="#C9A227" opacity="0.55" />
        </g>
      ))}

      {/* Varredura de leitura — movimento discreto e contínuo */}
      <rect className="nx-scene__sweep" x="-260" y="0" width="260" height="260" fill={`url(#${uid}-sweep)`} />
    </svg>
  );
}
