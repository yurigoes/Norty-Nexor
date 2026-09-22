import { telefoneBrasileiro } from '@norty-desk/shared';

/**
 * A máscara do campo de telefone.
 *
 * Formata enquanto a pessoa digita, e **não** impede nada: quem cola um
 * número estrangeiro com `+` vê o que colou. Máscara que recusa tecla é
 * máscara que briga com quem sabe o que está fazendo.
 *
 * Quem decide o que vale é `telefoneBrasileiro`, em `packages/shared`,
 * a mesma função que a API usa para gravar. Aqui é só aparência.
 */
export function mascaraDeTelefone(digitado: string): string {
  if (digitado.trim().startsWith('+')) return digitado;

  const d = digitado.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * O que a tela mostra embaixo do campo.
 *
 * Diz o número que vai ser gravado, em E.164, para não haver surpresa
 * — e cobra o DDD quando ele falta, que é o erro que aparece.
 */
export function ajudaDoTelefone(digitado: string): string {
  const limpo = digitado.trim();
  if (limpo === '') return 'Com DDD. O +55 entra sozinho.';

  const normalizado = telefoneBrasileiro(limpo);
  if (!normalizado) {
    return limpo.replace(/\D/g, '').length < 10
      ? 'Faltou o DDD.'
      : 'Isto não forma um número válido.';
  }
  return `Vai ser gravado como ${normalizado}.`;
}
