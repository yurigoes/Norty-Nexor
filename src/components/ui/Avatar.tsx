const PALETTE = ['#176BFF', '#20D5E8', '#7C5CFF', '#0FB2C4', '#F59E0B', '#10B981', '#EC4899', '#0F57D8'];

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
