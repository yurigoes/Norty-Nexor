/**
 * A marca do produto.
 *
 * Usa a logo enviada em Configuração → Marca quando existe; senão,
 * desenha a marca embutida. Este é o único lugar que sabe dessa
 * escolha — telas pedem "a marca" e recebem a certa.
 */
export function Marca({
  logoUrl,
  nome,
  tamanho = 32,
}: {
  logoUrl: string | null;
  nome: string;
  tamanho?: number;
}) {
  if (logoUrl) {
    return <img src={logoUrl} alt={nome} style={{ maxHeight: tamanho, width: 'auto' }} />;
  }
  return <MarcaEmbutida tamanho={tamanho} />;
}

/**
 * Marca com o nome ao lado, no formato do LICITA+: símbolo, nome em
 * peso extra e uma linha de apoio opcional.
 */
export function MarcaCompleta({
  logoUrl,
  nome,
  frase,
  tamanho = 34,
  inversa = false,
}: {
  logoUrl: string | null;
  nome: string;
  frase?: string | null;
  tamanho?: number;
  inversa?: boolean;
}) {
  return (
    <span className="marca">
      <Marca logoUrl={logoUrl} nome={nome} tamanho={tamanho} />
      {/* Uma logo enviada normalmente já traz o nome desenhado; repetir
          em texto ao lado duplicaria a marca. */}
      {!logoUrl ? (
        <span className="marca-bloco">
          <span className={`marca-texto -sm ${inversa ? '-inversa' : ''}`}>{nome}</span>
          {frase ? (
            <span className={`marca-tagline ${inversa ? '-inversa' : ''}`}>{frase}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Marca embutida — provisória.
 *
 * Fica no lugar até a logo do Norty Desk ser enviada em
 * Configuração → Marca. Segue a linguagem geométrica da casa (losango
 * com o gradiente) sem copiar o símbolo do LICITA+, que é dele.
 */
export function MarcaEmbutida({ tamanho = 32 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Norty Desk"
      style={{ flex: 'none' }}
    >
      <defs>
        <linearGradient id="nd-marca" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1677E8" />
          <stop offset="1" stopColor="#071E3D" />
        </linearGradient>
      </defs>

      <rect
        x="7"
        y="7"
        width="34"
        height="34"
        rx="9"
        transform="rotate(45 24 24)"
        fill="url(#nd-marca)"
      />

      {/* Balão de atendimento: é uma central de serviços, e o que ela
          faz é conversa registrada. */}
      <path d="M16 19.5h16v9.5a2 2 0 0 1-2 2h-8.6L17 35v-3.9a1 1 0 0 1-1-1z" fill="#fff" />
      <circle cx="20.5" cy="24.2" r="1.35" fill="#071E3D" />
      <circle cx="24" cy="24.2" r="1.35" fill="#071E3D" />
      <circle cx="27.5" cy="24.2" r="1.35" fill="#071E3D" />

      {/* O acento da casa, uma vez só. */}
      <path d="M31 13.5a9 9 0 0 1 5 5h-4.2a4.8 4.8 0 0 0-.8-.9z" fill="#FFCC00" />
    </svg>
  );
}

/** O check da lista do painel de entrada. */
export function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
