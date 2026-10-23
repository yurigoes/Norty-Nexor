/* =========================================================
   Validação de documentos brasileiros.
   Validar dígito verificador no cliente melhora a experiência;
   a API repete a validação porque é ela quem grava.
   ========================================================= */

export const onlyDigits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export function isValidPersonDocument(type: 'PF' | 'PJ', value: string): boolean {
  return type === 'PF' ? isValidCpf(value) : isValidCnpj(value);
}

/** Placa no padrão antigo (ABC1234) ou Mercosul (ABC1D23), sem hífen e em maiúsculas. */
export function normalizePlate(value: string): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidPlate(value: string): boolean {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(normalizePlate(value));
}

export function formatPlate(value: string): string {
  const plate = normalizePlate(value);
  // Placa antiga ganha hífen; a Mercosul é exibida contínua, como na chapa.
  return /^[A-Z]{3}\d{4}$/.test(plate) ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}

/** RENAVAM: 11 dígitos com dígito verificador módulo 11. */
export function isValidRenavam(value: string): boolean {
  const digits = onlyDigits(value).padStart(11, '0');
  if (digits.length !== 11 || /^0+$/.test(digits)) return false;
  const base = digits.slice(0, 10).split('').reverse();
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3];
  const sum = base.reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0);
  const check = (sum * 10) % 11;
  return (check === 10 ? 0 : check) === Number(digits[10]);
}

/** Chassi (VIN): 17 caracteres, sem I, O e Q. */
export function normalizeVin(value: string): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidVin(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(value));
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : value;
}

export function formatCnpj(value: string): string {
  const d = onlyDigits(value);
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : value;
}

export function formatDocument(value: string): string {
  const d = onlyDigits(value);
  return d.length === 14 ? formatCnpj(d) : formatCpf(d);
}

/**
 * Documento parcialmente oculto, para quem não tem `customers.sensitive`.
 * Minimização de dados (LGPD): a tela de atendimento precisa reconhecer o
 * cliente, não ler o CPF inteiro.
 */
export function maskDocument(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.***/****-${d.slice(12)}`;
  return d ? `${'*'.repeat(Math.max(0, d.length - 3))}${d.slice(-3)}` : '';
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value ?? '');
}
