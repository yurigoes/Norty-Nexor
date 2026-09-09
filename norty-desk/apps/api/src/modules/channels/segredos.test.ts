import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cifrar, cifrarConfig, configParaExibicao, decifrar, decifrarConfig, ehCifrado } from './segredos';

process.env.CHANNEL_SECRET_KEY ??= '0'.repeat(64);

test('cifra e decifra de volta', () => {
  const segredo = 'senha-do-imap-com-acento-é-ç';
  const guardado = cifrar(segredo);

  assert.notEqual(guardado, segredo);
  assert.ok(!guardado.includes('senha'));
  assert.equal(decifrar(guardado), segredo);
});

test('duas cifragens do mesmo texto são diferentes', () => {
  // Sem IV novo a cada vez, duas contas com a mesma senha teriam o
  // mesmo texto cifrado — e um olhar no banco já contaria isso.
  assert.notEqual(cifrar('igual'), cifrar('igual'));
});

test('texto cifrado adulterado não decifra', () => {
  const guardado = cifrar('senha');
  const partes = guardado.split(':');

  // Troca um byte do conteúdo cifrado.
  const adulterado = Buffer.from(partes[3]!, 'base64url');
  adulterado[0] = adulterado[0]! ^ 0xff;
  partes[3] = adulterado.toString('base64url');

  assert.throws(() => decifrar(partes.join(':')), /unable to authenticate|bad decrypt|Unsupported/i);
});

test('formato desconhecido é recusado', () => {
  assert.throws(() => decifrar('senha em texto claro'), /formato desconhecido/i);
  assert.throws(() => decifrar('v9:a:b:c'), /formato desconhecido/i);
});

test('cifra só os campos secretos da configuração', () => {
  const config = {
    host: 'imap.norty.com.br',
    port: 993,
    username: 'suporte@norty.com.br',
    password: 'segredo',
    apiKey: 'chave-evolution',
  };

  const cifrada = cifrarConfig(config);

  assert.equal(cifrada.host, 'imap.norty.com.br', 'campo comum não muda');
  assert.equal(cifrada.port, 993);
  assert.equal(cifrada.username, 'suporte@norty.com.br');
  assert.ok(ehCifrado(cifrada.password));
  assert.ok(ehCifrado(cifrada.apiKey));

  const decifrada = decifrarConfig(cifrada);
  assert.equal(decifrada.password, 'segredo');
  assert.equal(decifrada.apiKey, 'chave-evolution');
});

test('não cifra duas vezes numa edição', () => {
  const uma = cifrarConfig({ password: 'segredo' });
  const duas = cifrarConfig(uma);

  assert.equal(uma.password, duas.password);
  assert.equal(decifrarConfig(duas).password, 'segredo');
});

test('a tela recebe se existe segredo, nunca qual é', () => {
  const exibida = configParaExibicao(cifrarConfig({ host: 'x', password: 'segredo', apiKey: '' }));

  assert.equal(exibida.host, 'x');
  assert.equal(exibida.password, true, 'a tela precisa saber que há senha');
  assert.equal(exibida.apiKey, false);
  assert.ok(!JSON.stringify(exibida).includes('v1:'), 'nem o texto cifrado deve ir para a tela');
});
