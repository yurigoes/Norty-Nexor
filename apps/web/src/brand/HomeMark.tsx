/**
 * my Home — Símbolo da marca.
 *
 * Conceito: um escudo cujo topo é uma linha de telhado. Lê-se ao mesmo
 * tempo como casa e como proteção — que é exatamente a promessa do
 * produto. O desenho é geométrico e fechado, mais brasão do que ícone:
 * nada de casinha ilustrada, chave genérica ou prédio literal.
 *
 * Dentro do escudo, uma cumeeira dourada apontando para cima carrega a
 * ideia de melhoria contínua — o único elemento que quebra o traçado.
 */

type MarkVariant = 'gradient' | 'light' | 'dark' | 'mono';

export interface HomeMarkProps {
  size?: number;
  variant?: MarkVariant;
  /** Desenha o símbolo dentro do container preto (uso como app icon / favicon). */
  boxed?: boolean;
  className?: string;
  title?: string;
}

let uid = 0;

export function HomeMark({
  size = 32,
  variant = 'gradient',
  boxed = false,
  className,
  title,
}: HomeMarkProps) {
  const id = `mh-mark-${(uid += 1)}`;

  const shieldColor =
    variant === 'light' ? 'var(--mh-white)'
    : variant === 'dark' ? 'var(--mh-black)'
    : variant === 'mono' ? 'currentColor'
    : `url(#${id}-shield)`;

  const ridgeColor =
    variant === 'mono' ? 'currentColor'
    : variant === 'dark' ? 'var(--mh-gold-600)'
    : 'var(--mh-gold)';

  // No formato boxed o escudo encolhe para respeitar a margem do container.
  const s = boxed ? 0.78 : 1;
  const c = boxed ? 20 : 20;
  const t = (x: number, y: number) => `${c + (x - 20) * s} ${c + (y - 20) * s}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-shield`} x1="7" y1="4" x2="33" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E0C368" />
          <stop offset="0.55" stopColor="#C9A227" />
          <stop offset="1" stopColor="#8A6B10" />
        </linearGradient>
        <linearGradient id={`${id}-box`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A1D24" />
          <stop offset="1" stopColor="#0A0B0D" />
        </linearGradient>
      </defs>

      {boxed && (
        <>
          <rect width="40" height="40" rx="11" fill={`url(#${id}-box)`} />
          <rect x="0.6" y="0.6" width="38.8" height="38.8" rx="10.4" stroke="rgba(201,162,39,0.28)" strokeWidth="1.2" />
        </>
      )}

      {/* Escudo com cumeeira: telhado no topo, ponta de brasão embaixo. */}
      <path
        d={`M${t(20, 4)} L${t(33.5, 13)} L${t(33.5, 23.5)} C${t(33.5, 30)} ${t(27.5, 34)} ${t(20, 36.5)} C${t(12.5, 34)} ${t(6.5, 30)} ${t(6.5, 23.5)} L${t(6.5, 13)} Z`}
        stroke={shieldColor}
        strokeWidth={2.6 * s}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Cumeeira interna — o vetor de melhoria. */}
      <path
        d={`M${t(13.4, 25.2)} L${t(20, 18.4)} L${t(26.6, 25.2)}`}
        stroke={ridgeColor}
        strokeWidth={3.1 * s}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
