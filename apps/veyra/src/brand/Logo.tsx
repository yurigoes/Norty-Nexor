import { useId } from 'react';

/**
 * VEYRA — Símbolo
 *
 * O V é desenhado como duas fitas que descem, se cruzam e voltam a
 * subir. A leitura pretendida é fluxo e convergência: várias entradas
 * (canais, origens, campanhas) que descem até um ponto e voltam como
 * resultado. É por isso que o traço é aberto e contínuo em vez de uma
 * letra sólida — a forma precisa sugerir movimento, não estabilidade.
 *
 * O símbolo funciona sozinho como ícone de aplicativo: em 32px as duas
 * fitas ainda se distinguem porque a folga entre elas nunca é menor que
 * a espessura do traço.
 */

interface MarkProps {
  size?: number;
  /** `solida` usa uma cor chapada — para fundos que já têm gradiente. */
  variante?: 'gradiente' | 'solida' | 'contorno';
  cor?: string;
  className?: string;
}

export function VeyraMark({ size = 32, variante = 'gradiente', cor, className }: MarkProps) {
  const id = useId();
  const gradId = `vy-mark-${id}`;
  const glowId = `vy-glow-${id}`;
  const traco = variante === 'gradiente' ? `url(#${gradId})` : (cor ?? 'currentColor');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="VEYRA"
    >
      <defs>
        <linearGradient id={gradId} x1="6" y1="30" x2="58" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--vy-cyan)" />
          <stop offset="52%" stopColor="var(--vy-blue)" />
          <stop offset="100%" stopColor="var(--vy-violet)" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        stroke={traco}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter={variante === 'gradiente' ? `url(#${glowId})` : undefined}
      >
        {/* Fita externa: a descida completa. */}
        <path d="M7 9 L30.5 55 L57 9" strokeWidth={variante === 'contorno' ? 3.8 : 7} />
        {/* Fita interna: desce menos e sobe junto — é ela que cria a
            dobra e impede que a marca vire só uma letra. */}
        <path
          d="M21 9 L37.5 42 L52.5 9"
          strokeWidth={variante === 'contorno' ? 3 : 5.4}
          opacity={variante === 'gradiente' ? 0.92 : 0.7}
        />
      </g>
    </svg>
  );
}

interface WordmarkProps {
  size?: number;
  className?: string;
  /** Assinatura sob o nome. Some abaixo de ~20px de corpo. */
  assinatura?: string;
}

export function VeyraWordmark({ size = 22, className, assinatura }: WordmarkProps) {
  return (
    <span className={className} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: size,
          fontWeight: 800,
          letterSpacing: '0.22em',
          lineHeight: 1,
          color: 'var(--text-strong)',
          textIndent: '0.22em',
        }}
      >
        VEYRA
      </span>
      {assinatura && size >= 20 && (
        <span
          style={{
            fontSize: Math.max(8, size * 0.3),
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-subtle)',
          }}
        >
          {assinatura}
        </span>
      )}
    </span>
  );
}

interface LockupProps {
  size?: number;
  assinatura?: string;
  className?: string;
}

/** Símbolo + nome. É esta a forma que aparece no cabeçalho e no login. */
export function VeyraLockup({ size = 24, assinatura, className }: LockupProps) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.42 }}>
      <VeyraMark size={size * 1.45} />
      <VeyraWordmark size={size} assinatura={assinatura} />
    </span>
  );
}

/** Ícone do aplicativo: fundo midnight, gradiente e o símbolo centrado. */
export function VeyraAppIcon({ size = 56, raio = 0.24 }: { size?: number; raio?: number }) {
  const id = useId();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size * raio,
        background: 'linear-gradient(150deg, #0d2038 0%, #07111f 62%, #0a1728 100%)',
        border: '1px solid rgb(143 163 189 / 0.16)',
        boxShadow: 'var(--shadow-md), inset 0 1px 0 rgb(247 250 252 / 0.06)',
        flexShrink: 0,
      }}
      key={id}
    >
      <VeyraMark size={size * 0.62} />
    </span>
  );
}
