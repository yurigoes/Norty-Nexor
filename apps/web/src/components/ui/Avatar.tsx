/* Tons escuros da paleta preto + dourado: o avatar leva texto branco,
   então nenhum deles pode ficar claro a ponto de perder contraste. */
const PALETTE = ['#8A6B10', '#7A4E20', '#2B2F37', '#1F5A52', '#7A2833', '#4F5A22', '#2F4761', '#5C4A8A'];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashHue(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export function Avatar({
  name,
  size = 'md',
  square = false,
  ring = false,
  className = '',
}: {
  name: string;
  size?: AvatarSize;
  square?: boolean;
  ring?: boolean;
  className?: string;
}) {
  const color = hashHue(name);
  return (
    <span
      className={`nx-avatar nx-avatar--${size} ${square ? 'nx-avatar--square' : ''} ${ring ? 'nx-avatar--ring' : ''} ${className}`}
      style={{ background: `linear-gradient(140deg, ${color}, ${color}bb)` }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
