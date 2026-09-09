import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type FormSchema, validarRespostas, validarSchema } from './domain';

/**
 * O formulário dinâmico.
 *
 * O que se prova aqui: um formulário mal montado é recusado na hora de
 * salvar, e não meses depois quando alguém repara que duas respostas se
 * apagavam; e chave desconhecida é erro, pela mesma razão que
 * `forbidNonWhitelisted` recusa campo desconhecido no corpo.
 */

const formulario: FormSchema = {
  fields: [
    { key: 'patrimonio', label: 'Patrimônio', type: 'TEXTO', required: true },
    { key: 'ramal', label: 'Ramal', type: 'NUMERO', required: false },
    {
      key: 'andar',
      label: 'Andar',
      type: 'SELECAO',
      required: true,
      options: [
        { value: 'terreo', label: 'Térreo' },
        { value: 'primeiro', label: '1º andar' },
      ],
    },
    {
      key: 'perifericos',
      label: 'Periféricos',
      type: 'MULTISELECAO',
      required: false,
      options: [
        { value: 'mouse', label: 'Mouse' },
        { value: 'teclado', label: 'Teclado' },
      ],
    },
    { key: 'urgente', label: 'É urgente', type: 'BOOLEANO', required: false },
    { key: 'quando', label: 'Quando aconteceu', type: 'DATA', required: false },
  ],
};

describe('validarSchema', () => {
  it('aceita um formulário bem montado', () => {
    assert.deepEqual(validarSchema(formulario), []);
  });

  it('recusa chave repetida: uma resposta apagaria a outra', () => {
    const erros = validarSchema({
      fields: [
        { key: 'ramal', label: 'Ramal', type: 'TEXTO', required: false },
        { key: 'ramal', label: 'Outro ramal', type: 'TEXTO', required: false },
      ],
    });

    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /repetida/);
  });

  it('recusa chave que não vira nome de campo', () => {
    const erros = validarSchema({
      fields: [{ key: 'Patrimônio 1', label: 'Patrimônio', type: 'TEXTO', required: false }],
    });

    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /letras minúsculas/);
  });

  it('recusa campo de escolha sem opção — obrigatório impossível de preencher', () => {
    const erros = validarSchema({
      fields: [{ key: 'andar', label: 'Andar', type: 'SELECAO', required: true, options: [] }],
    });

    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /ao menos uma opção/);
  });

  it('recusa opção repetida', () => {
    const erros = validarSchema({
      fields: [
        {
          key: 'andar',
          label: 'Andar',
          type: 'SELECAO',
          required: false,
          options: [
            { value: 'terreo', label: 'Térreo' },
            { value: 'terreo', label: 'Piso térreo' },
          ],
        },
      ],
    });

    assert.match(erros[0].mensagem, /Opção repetida/);
  });
});

describe('validarRespostas', () => {
  it('aceita as respostas certas', () => {
    const erros = validarRespostas(formulario, {
      patrimonio: 'PAT-4721',
      ramal: 2210,
      andar: 'terreo',
      perifericos: ['mouse'],
      urgente: true,
      quando: '2026-03-10T09:00:00.000Z',
    });

    assert.deepEqual(erros, []);
  });

  it('cobra o obrigatório que veio vazio', () => {
    const erros = validarRespostas(formulario, { patrimonio: '   ', andar: 'terreo' });

    assert.equal(erros.length, 1);
    assert.equal(erros[0].key, 'patrimonio');
    assert.match(erros[0].mensagem, /obrigatório/);
  });

  it('o opcional em branco não é cobrado', () => {
    const erros = validarRespostas(formulario, {
      patrimonio: 'PAT-1',
      andar: 'terreo',
      ramal: null,
      perifericos: [],
    });

    assert.deepEqual(erros, []);
  });

  it('recusa chave desconhecida em vez de guardá-la em silêncio', () => {
    const erros = validarRespostas(formulario, {
      patrimonio: 'PAT-1',
      andar: 'terreo',
      campo_que_sumiu: 'algum valor',
    });

    assert.equal(erros.length, 1);
    assert.equal(erros[0].key, 'campo_que_sumiu');
    assert.match(erros[0].mensagem, /desconhecido/);
  });

  it('recusa valor fora das opções, e diz qual', () => {
    const erros = validarRespostas(formulario, { patrimonio: 'PAT-1', andar: 'cobertura' });

    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /"cobertura" não é uma opção/);
  });

  it('recusa a lista com um valor fora das opções', () => {
    const erros = validarRespostas(formulario, {
      patrimonio: 'PAT-1',
      andar: 'terreo',
      perifericos: ['mouse', 'monitor'],
    });

    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /"monitor" não é opção/);
  });

  it('recusa número que veio como texto: o banco guardaria a string', () => {
    const erros = validarRespostas(formulario, {
      patrimonio: 'PAT-1',
      andar: 'terreo',
      ramal: '2210',
    });

    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /espera um número/);
  });

  it('recusa data que não é data', () => {
    const erros = validarRespostas(formulario, {
      patrimonio: 'PAT-1',
      andar: 'terreo',
      quando: 'ontem',
    });

    assert.match(erros[0].mensagem, /espera uma data/);
  });
});
