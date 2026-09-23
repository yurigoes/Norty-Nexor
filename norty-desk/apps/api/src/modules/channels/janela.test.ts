import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FOLGA_MINUTOS,
  JANELA_HORAS,
  dentroDaJanela,
  motivoDaJanelaFechada,
  restamMs,
  restanteEmPalavras,
} from './janela';

/**
 * A janela de 24 h da Meta.
 *
 * A regra é dela, não nossa: fora da janela só passa template aprovado.
 * O que se prova aqui é que o Desk **sabe disso antes de tentar** — o
 * contrário custaria quatro tentativas com backoff que nenhuma passaria,
 * e deixaria "131047" no diagnóstico.
 */

const agora = new Date('2026-09-23T12:00:00Z');
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3600_000);

describe('a janela de 24 horas', () => {
  it('quem falou há pouco recebe resposta', () => {
    assert.equal(dentroDaJanela(horasAtras(1), agora), true);
    assert.equal(dentroDaJanela(horasAtras(23), agora), true);
  });

  it('passadas as 24 h, não recebe', () => {
    assert.equal(dentroDaJanela(horasAtras(25), agora), false);
    assert.equal(dentroDaJanela(horasAtras(72), agora), false);
  });

  it('quem nunca escreveu não recebe — a empresa não inicia conversa', () => {
    assert.equal(dentroDaJanela(null, agora), false);
    assert.equal(dentroDaJanela(undefined, agora), false);
  });

  it('a folga fecha a janela antes do limite exato', () => {
    // No limite cravado, os dois relógios precisariam concordar ao
    // segundo. A folga é o que evita a resposta aceita aqui e recusada
    // lá — e é por isso que este caso, que "deveria" caber, não cabe.
    const noLimite = new Date(agora.getTime() - JANELA_HORAS * 3600_000 + 60_000);
    assert.equal(dentroDaJanela(noLimite, agora), false);

    const comFolga = new Date(
      agora.getTime() - JANELA_HORAS * 3600_000 + (FOLGA_MINUTOS + 2) * 60_000,
    );
    assert.equal(dentroDaJanela(comFolga, agora), true);
  });

  it('o tempo restante nunca é negativo', () => {
    assert.equal(restamMs(horasAtras(100), agora), 0);
    assert.ok(restamMs(horasAtras(1), agora) > 0);
  });
});

describe('o motivo, para quem lê o diagnóstico', () => {
  it('é uma frase em português, e não um código da Meta', () => {
    const nunca = motivoDaJanelaFechada(null);
    const vencida = motivoDaJanelaFechada(horasAtras(30));

    for (const frase of [nunca, vencida]) {
      assert.ok(frase.length > 40, frase);
      assert.equal(/\d{6}/.test(frase), false, `código cru na mensagem: ${frase}`);
    }

    // E os dois casos são diferentes: "nunca escreveu" e "escreveu há
    // muito tempo" pedem coisas diferentes de quem for resolver.
    assert.notEqual(nunca, vencida);
    assert.ok(nunca.includes('nunca'), nunca);
  });

  it('o selo na tela some quando a janela fecha', () => {
    assert.equal(restanteEmPalavras(horasAtras(30)), null);
    assert.ok(restanteEmPalavras(new Date())?.includes('h'));
  });
});
