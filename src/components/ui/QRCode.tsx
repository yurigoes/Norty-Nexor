/**
 * Representação visual de QR Code para o MVP.
 *
 * Gera um padrão determinístico a partir do payload (mesmo código = mesma
 * imagem), com os três marcadores de posição característicos. Não é um QR
 * decodificável — na versão de produção este componente é substituído por um
 * encoder real mantendo exatamente a mesma interface.
 */
export function QRCode({ value, size = 148, className = '' }: { value: string; size?: number; className?: string }) {
  const grid = 25;
  const cells: boolean[] = [];

  let seed = 0;
  for (let i = 0; i < value.length; i += 1) seed = (seed * 131 + value.charCodeAt(i)) >>> 0;

  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const isFinder = (r: number, c: number) => {
    const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    return inBox(0, 0) || inBox(0, grid - 7) || inBox(grid - 7, 0);
  };

  for (let r = 0; r < grid; r += 1) {
    for (let c = 0; c < grid; c += 1) {
      if (isFinder(r, c)) {
        const lr = r < 7 ? r : r - (grid - 7);
        const lc = c < 7 ? c : c - (grid - 7);
        const ring = Math.max(Math.abs(lr - 3), Math.abs(lc - 3));
        cells.push(ring !== 2);
      } else {
        cells.push(rand() > 0.52);
      }
    }
  }

  const unit = size / grid;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`nx-qr ${className}`} role="img" aria-label={`QR Code ${value}`}>
      <rect width={size} height={size} rx="10" fill="#fff" />
      {cells.map((on, i) => {
        if (!on) return null;
        const r = Math.floor(i / grid);
        const c = i % grid;
        return (
          <rect
            key={i}
            x={c * unit}
            y={r * unit}
            width={unit * 0.92}
            height={unit * 0.92}
            rx={unit * 0.24}
            fill="#08111F"
          />
        );
      })}
    </svg>
  );
}
