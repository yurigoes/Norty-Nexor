/* =========================================================
   Cena de entrada do login: o carro chega em perspectiva até
   o meio do painel, as rodas giram durante o movimento e, ao
   parar, os faróis piscam duas vezes.

   Desenho próprio em SVG (sem arquivo 3D): a profundidade vem
   de transformações 3D do CSS. Com "reduzir movimento" ativo,
   o carro aparece já parado e sem piscar.
   ========================================================= */
export function CarScene() {
  return (
    <div className="car-scene" aria-hidden>
      <div className="car-scene__road" />
      <div className="car-scene__car">
        <svg viewBox="0 0 520 190" className="car-scene__svg">
          <defs>
            <linearGradient id="cs-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f86ff" />
              <stop offset="0.55" stopColor="#1677ff" />
              <stop offset="1" stopColor="#0b4fb8" />
            </linearGradient>
            <linearGradient id="cs-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#9cc4ff" stopOpacity="0.85" />
              <stop offset="1" stopColor="#1b2d52" stopOpacity="0.95" />
            </linearGradient>
            <radialGradient id="cs-beam" cx="0" cy="0.5" r="1">
              <stop offset="0" stopColor="#fff6d6" stopOpacity="0.9" />
              <stop offset="1" stopColor="#fff6d6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="cs-shadow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#000" stopOpacity="0.55" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Sombra no chão */}
          <ellipse cx="250" cy="168" rx="215" ry="14" fill="url(#cs-shadow)" />

          {/* Facho dos faróis (aparece só no piscar) */}
          <path className="car-scene__beam" d="M455 112 L520 78 L520 150 Z" fill="url(#cs-beam)" />

          {/* Carroceria */}
          <path d="M40 132 C40 112 52 104 78 100 L150 92 C176 62 206 46 258 44 L318 44 C356 44 380 58 408 86 L452 96 C474 100 486 110 488 126 L490 140 C490 148 484 152 476 152 L52 152 C44 152 40 146 40 138 Z"
            fill="url(#cs-body)" />
          {/* Vincos e brilho */}
          <path d="M70 118 L470 118" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="2" />
          <path d="M160 92 C186 64 214 52 258 50 L316 50 C350 50 372 62 398 88" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />

          {/* Vidros */}
          <path d="M168 92 C190 68 214 58 252 57 L262 57 L262 92 Z" fill="url(#cs-glass)" />
          <path d="M272 57 L314 57 C342 57 362 68 384 92 L272 92 Z" fill="url(#cs-glass)" />
          <rect x="263" y="56" width="8" height="37" fill="#0b1220" opacity="0.6" />

          {/* Maçaneta e retrovisor */}
          <rect x="300" y="104" width="22" height="4" rx="2" fill="#0b1220" opacity="0.45" />
          <path d="M384 90 L398 84 L404 92 L390 96 Z" fill="#0b4fb8" />

          {/* Lanterna traseira */}
          <rect x="40" y="110" width="12" height="14" rx="3" fill="#f04438" />

          {/* Farol */}
          <path d="M466 104 L486 110 L488 122 L466 120 Z" fill="#dfe9ff" />
          <path className="car-scene__light" d="M466 104 L486 110 L488 122 L466 120 Z" fill="#fff6c2" />
          <circle className="car-scene__glow" cx="480" cy="114" r="20" fill="#fff6c2" />

          {/* Para-choques */}
          <rect x="436" y="134" width="54" height="8" rx="4" fill="#0b1220" opacity="0.5" />
          <rect x="40" y="134" width="44" height="8" rx="4" fill="#0b1220" opacity="0.5" />

          {/* Rodas */}
          {[128, 400].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="150" r="30" fill="#0b1220" />
              <circle cx={cx} cy="150" r="30" fill="none" stroke="#22304d" strokeWidth="3" />
              <g className="car-scene__wheel" style={{ transformOrigin: `${cx}px 150px` }}>
                <circle cx={cx} cy="150" r="17" fill="#c3cce0" />
                {[0, 72, 144, 216, 288].map((a) => (
                  <rect key={a} x={cx - 2} y="134" width="4" height="14" rx="2" fill="#7d8aa8" transform={`rotate(${a} ${cx} 150)`} />
                ))}
                <circle cx={cx} cy="150" r="5" fill="#20c5a0" />
              </g>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
