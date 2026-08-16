/**
 * NEXOR — Símbolo da marca.
 *
 * Conceito: o monograma "N" desenhado como um traçado contínuo de rede —
 * três vértices conectados por um único caminho, com um nó luminoso na
 * extremidade superior. Lê-se simultaneamente como letra, conexão e
 * infraestrutura. Deliberadamente abstrato: nada de prédios ou chaves.
 */

type MarkVariant = 'gradient' | 'light' | 'navy' | 'mono';

export interface NexorMarkProps {
  size?: number;
  variant?: MarkVariant;
  /** Desenha o símbolo dentro do container navy (uso como app icon / favicon). */
  boxed?: boolean;
  className?: string;
  title?: string;
}

let uid = 0;

export function NexorMark({
  size = 32,
  variant = 'gradient',
  boxed = false,
  className,
  title,
}: NexorMarkProps) {
  const id = `nx-mark-${(uid += 1)}`;
  const strokeGradient = `url(#${id}-stroke)`;

  const strokeColor =
    variant === 'light' ? 'var(--nexor-white)'
    : variant === 'navy' ? 'var(--nexor-navy)'
    : variant === 'mono' ? 'currentColor'
    : strokeGradient;

  const nodeColor =
    variant === 'gradient' ? 'var(--nexor-cyan)'
    : variant === 'light' ? 'var(--nexor-cyan)'
    : variant === 'navy' ? 'var(--nexor-blue)'
    : 'currentColor';

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
        <linearGradient id={`${id}-stroke`} x1="8" y1="34" x2="32" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#176BFF" />
          <stop offset="1" stopColor="#20D5E8" />
        </linearGradient>
        <linearGradient id={`${id}-box`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#12233C" />
          <stop offset="1" stopColor="#08111F" />
        </linearGradient>
      </defs>

      {boxed && (
        <>
          <rect width="40" height="40" rx="11" fill={`url(#${id}-box)`} />
          <rect x="0.6" y="0.6" width="38.8" height="38.8" rx="10.4" stroke="rgba(255,255,255,0.10)" strokeWidth="1.2" />
        </>
      )}

      <path
        d={boxed ? 'M12 29V13L28 27V11' : 'M10 31V9L30 31V9'}
        stroke={strokeColor}
        strokeWidth={boxed ? 3.4 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={boxed ? 28 : 30}
        cy={boxed ? 11 : 9}
        r={boxed ? 3.1 : 3.6}
        fill={nodeColor}
      />
      {!boxed && <circle cx="30" cy="9" r="6.6" stroke={nodeColor} strokeOpacity="0.22" strokeWidth="1.4" />}
    </svg>
  );
}
