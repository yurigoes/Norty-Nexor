/**
 * O transporte de push, escolhido no módulo.
 *
 * Símbolo em vez de classe pela mesma razão do `PORTAS_DE_ENVIO` dos
 * canais: quem injeta quer *uma porta de push*, e não precisa saber se
 * ela fala com o Google ou só anota numa lista.
 */
export const PORTA_DE_PUSH = Symbol('PortaDePush');
