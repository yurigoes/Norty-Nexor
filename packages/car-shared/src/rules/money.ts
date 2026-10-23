/* =========================================================
   Dinheiro em centavos inteiros.
   Em ponto flutuante 0,1 + 0,2 não fecha caixa. Toda conta
   de valor passa por aqui em centavos e só vira reais na
   borda (exibição ou resposta da API).
   ========================================================= */

/** Converte reais (número ou texto decimal "123.45") para centavos inteiros. */
export function toCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Valor monetário inválido.');
    return Math.round(value * 100);
  }
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`Valor monetário inválido: ${text}`);
  const negative = text.startsWith('-');
  const [int, frac = ''] = text.replace('-', '').split('.');
  const cents = Number(int) * 100 + Number((frac + '00').slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return negative ? -cents : cents;
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Texto decimal com duas casas, para gravar em `Decimal(12,2)` sem passar por float. */
export function centsToDecimalString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}

/** Percentual aplicado a centavos, arredondado ao centavo. */
export function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return BRL.format(value);
}
