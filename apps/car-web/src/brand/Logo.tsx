/** Marca do Norty Car: carro estilizado em azul tecnológico sobre azul-noite. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#0B1220" />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.25" fill="none" stroke="rgba(255,255,255,0.08)" />
      <path d="M14 40l6-14a6 6 0 0 1 5.5-3.6h13A6 6 0 0 1 44 26l6 14" fill="none" stroke="#1677FF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="11" y="38" width="42" height="10" rx="4" fill="#1677FF" />
      <circle cx="21" cy="48" r="4" fill="#20C5A0" />
      <circle cx="43" cy="48" r="4" fill="#20C5A0" />
    </svg>
  );
}

export function Wordmark({ subtitle = 'Controle de Carros' }: { subtitle?: string }) {
  return (
    <span className="wordmark">
      <strong>Norty Car</strong>
      <small>{subtitle}</small>
    </span>
  );
}
