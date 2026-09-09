import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { marcadoresInvalidos, preencherModelo } from './domain';

/**
 * Modelos de texto.
 *
 * O que se prova aqui: marcador desconhecido **fica no texto**, e é a
 * tela de configuração que o recusa. Sumir com ele faria a frase perder
 * um pedaço na resposta ao cliente, sem ninguém reparar.
 */

const contexto = {
  'chamado.numero': '1042',
  'chamado.assunto': 'Impressora travada',
  'requerente.nome': 'Marina',
  'agente.nome': 'Joana',
  'organizacao.nome': 'Norty',
};

describe('preencherModelo', () => {
  it('troca os marcadores conhecidos', () => {
    const texto = preencherModelo(
      'Olá, {{requerente.nome}}. Sobre o chamado #{{chamado.numero}} — {{chamado.assunto}}.',
      contexto,
    );

    assert.equal(texto, 'Olá, Marina. Sobre o chamado #1042 — Impressora travada.');
  });

  it('aceita espaço dentro das chaves', () => {
    assert.equal(preencherModelo('Oi, {{ requerente.nome }}.', contexto), 'Oi, Marina.');
  });

  it('deixa o marcador desconhecido visível em vez de apagá-lo', () => {
    const texto = preencherModelo('Oi, {{requerente.apelido}}.', contexto);
    assert.equal(texto, 'Oi, {{requerente.apelido}}.');
  });

  it('deixa o conhecido que não veio no contexto, em vez de escrever vazio', () => {
    const texto = preencherModelo('Categoria: {{chamado.categoria}}.', contexto);
    assert.equal(texto, 'Categoria: {{chamado.categoria}}.');
  });

  it('troca o mesmo marcador todas as vezes', () => {
    const texto = preencherModelo('{{agente.nome}} e {{agente.nome}}', contexto);
    assert.equal(texto, 'Joana e Joana');
  });
});

describe('marcadoresInvalidos', () => {
  it('acha o que não existe, sem repetir', () => {
    const erros = marcadoresInvalidos(
      'Oi {{requerente.nome}}, {{requerente.apelido}} e {{requerente.apelido}}, {{chamado.cor}}.',
    );

    assert.deepEqual(erros.sort(), ['chamado.cor', 'requerente.apelido']);
  });

  it('texto sem marcador não tem problema', () => {
    assert.deepEqual(marcadoresInvalidos('Bom dia. Já estamos olhando.'), []);
  });
});
