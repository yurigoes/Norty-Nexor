/**
 * Nome de usuário: 3 a 64 caracteres — letras, dígitos, ponto, hífen e
 * sublinhado —, começando por letra ou dígito, guardado em minúsculas.
 * Sem "@": é isso que deixa o login decidir entre e-mail e usuário sem
 * ambiguidade.
 */
export const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{2,63}$/i;

export const MSG_USERNAME =
  'Nome de usuário: 3 a 64 caracteres, só letras, dígitos, ponto, hífen ou sublinhado.';

/** Forma de gravar e de comparar: minúsculas, sem espaço em volta. */
export function normalizarUsername(valor: string): string {
  return valor.trim().toLowerCase();
}
