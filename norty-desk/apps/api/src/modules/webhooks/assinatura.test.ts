import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assinar, conferir } from './assinatura';

describe('assinatura de webhook', () => {
  const segredo = 'segredo-do-assinante';
  const corpo = JSON.stringify({ evento: 'ticket.criado', numero: 42 });

  it('o que foi assinado confere', () => {
    const { timestamp, assinatura } = assinar(corpo, segredo);
    assert.equal(conferir(corpo, segredo, timestamp, assinatura), true);
  });

  it('corpo alterado não confere', () => {
    const { timestamp, assinatura } = assinar(corpo, segredo);
    assert.equal(conferir(corpo.replace('42', '43'), segredo, timestamp, assinatura), false);
  });

  it('segredo errado não confere', () => {
    const { timestamp, assinatura } = assinar(corpo, segredo);
    assert.equal(conferir(corpo, 'outro-segredo', timestamp, assinatura), false);
  });

  it('entrega antiga não confere, mesmo com assinatura boa', () => {
    // Reenvio: quem interceptou a entrega de ontem não pode reaproveitá-la.
    const ontem = new Date(Date.now() - 24 * 3600 * 1000);
    const { timestamp, assinatura } = assinar(corpo, segredo, ontem);

    assert.equal(
      conferir(corpo, segredo, timestamp, assinatura),
      false,
      'assinar só o corpo deixaria a entrega válida para sempre',
    );
  });

  it('timestamp trocado invalida: ele entra no que se assina', () => {
    // Assinada há um minuto — ainda dentro da tolerância —, mas
    // apresentada com o timestamp de agora. Se o timestamp não entrasse
    // no que se assina, esta troca passaria e o reenvio ficaria fácil.
    const umMinutoAtras = new Date(Date.now() - 60_000);
    const { assinatura } = assinar(corpo, segredo, umMinutoAtras);
    const agora = String(Math.floor(Date.now() / 1000));

    assert.equal(conferir(corpo, segredo, agora, assinatura), false);
  });

  it('assinatura de tamanho errado não derruba a conferência', () => {
    const { timestamp } = assinar(corpo, segredo);
    // `timingSafeEqual` lança quando os buffers têm tamanhos diferentes.
    assert.equal(conferir(corpo, segredo, timestamp, 'sha256=abcd'), false);
    assert.equal(conferir(corpo, segredo, timestamp, ''), false);
  });
});
