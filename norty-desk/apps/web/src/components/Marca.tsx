/**
 * A marca do produto.
 *
 * Usa a logo enviada pela administração quando existe; senão, desenha a
 * marca embutida. O componente é o único lugar que sabe dessa escolha —
 * telas pedem "a marca" e recebem a certa.
 */
export function Marca({
  logoUrl,
  nome,
  tamanho = 32,
  tom = 'claro',
}: {
  logoUrl: string | null;
  nome: string;
  tamanho?: number;
  /** `claro` = sobre fundo escuro. `escuro` = sobre fundo claro. */
  tom?: 'claro' | 'escuro';
}) {
  if (logoUrl) {
    return <img src={logoUrl} alt={nome} style={{ maxHeight: tamanho, width: 'auto' }} />;
  }

  return <MarcaEmbutida tamanho={tamanho} tom={tom} />;
}

/**
 * Marca embutida — provisória.
 *
 * Fica no lugar até a logo do Norty Desk ser enviada em
 * Configuração → Marca. Segue a linguagem geométrica da casa (losango
 * com o gradiente) sem copiar o símbolo do LICITA+, que é dele.
 */
export function MarcaEmbutida({
  tamanho = 32,
  tom = 'claro',
}: {
  tamanho?: number;
  tom?: 'claro' | 'escuro';
}) {
  const id = `nd-grad-${tom}`;

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
        <linearGradient id={id} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1677E8" />
          <stop offset="1" stopColor="#071E3D" />
        </linearGradient>
      </defs>

      <rect x="7" y="7" width="34" height="34" rx="9" transform="rotate(45 24 24)" fill={`url(#${id})`} />

      {/* Balão de atendimento: é uma central de serviços, e o que ela
          faz é conversa registrada. */}
      <path
        d="M16 19.5h16v9.5a2 2 0 0 1-2 2h-8.6L17 35v-3.9a1 1 0 0 1-1-1z"
        fill="#fff"
      />
      <circle cx="20.5" cy="24.2" r="1.35" fill="#071E3D" />
      <circle cx="24" cy="24.2" r="1.35" fill="#071E3D" />
      <circle cx="27.5" cy="24.2" r="1.35" fill="#071E3D" />

      {/* O acento da casa, uma vez só. */}
      <path d="M31 13.5a9 9 0 0 1 5 5h-4.2a4.8 4.8 0 0 0-.8-.9z" fill="#FFCC00" />
    </svg>
  );
}
