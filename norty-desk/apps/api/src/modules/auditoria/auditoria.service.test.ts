import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AuditoriaService } from './auditoria.service';

describe('diferença da trilha', () => {
  it('registra só o que mudou', () => {
    const diff = AuditoriaService.diferenca(
      { name: 'Suporte', email: 'a@b.c', isActive: true },
      { name: 'Suporte N1', email: 'a@b.c', isActive: true },
    );

    assert.deepEqual(diff, { name: { de: 'Suporte', para: 'Suporte N1' } });
  });

  it('nada mudou é nulo, não um objeto vazio', () => {
    assert.equal(AuditoriaService.diferenca({ a: 1 }, { a: 1 }), null);
    assert.equal(AuditoriaService.diferenca(null, null), null);
  });

  it('campo novo e campo removido aparecem', () => {
    const diff = AuditoriaService.diferenca({ a: 1 }, { a: 1, b: 2 });
    assert.deepEqual(diff, { b: { de: null, para: 2 } });
  });

  it('segredo nunca entra na trilha, nem o valor antigo', () => {
    const diff = AuditoriaService.diferenca(
      { host: 'imap.antigo.com', password: 'senha-velha' },
      { host: 'imap.novo.com', password: 'senha-nova' },
    );

    assert.deepEqual(diff!.password, { de: '(oculto)', para: '(alterado)' });
    assert.deepEqual(diff!.host, { de: 'imap.antigo.com', para: 'imap.novo.com' });

    const texto = JSON.stringify(diff);
    assert.ok(!texto.includes('senha-velha'), 'quem lê a trilha não precisa da senha antiga');
    assert.ok(!texto.includes('senha-nova'));
  });

  it('compara valor estruturado pelo conteúdo, não pela referência', () => {
    assert.equal(AuditoriaService.diferenca({ events: ['a', 'b'] }, { events: ['a', 'b'] }), null);

    const diff = AuditoriaService.diferenca({ events: ['a'] }, { events: ['a', 'b'] });
    assert.deepEqual(diff, { events: { de: ['a'], para: ['a', 'b'] } });
  });
});
