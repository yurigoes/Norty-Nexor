/**
 * O PIN que ainda não existe.
 *
 * Hash vazio não casa com nenhum PIN: a pessoa nasce cadastrada e
 * **sem** poder entrar, e escolhe o dela no primeiro acesso.
 *
 * Mora aqui, e não dentro de um módulo, porque dois caminhos criam
 * pessoa de empresa — a carteira, à mão, e o integrador, a partir do
 * sistema de origem. Com uma constante em cada, bastaria um deles
 * ganhar um valor "provisório" utilizável para abrir uma porta que o
 * outro fechou.
 */
export const SEM_PIN = '';
