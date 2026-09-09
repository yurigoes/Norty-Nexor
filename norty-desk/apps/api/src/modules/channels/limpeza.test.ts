import assert from 'node:assert/strict';
import { test } from 'node:test';

import { corpoDaMensagem, htmlParaTexto, limparAssunto, limparCorpoDeEmail } from './limpeza';

test('corta a citação em português, inglês e espanhol', () => {
  const casos = [
    'Ainda não resolveu.\n\nEm 9 de setembro de 2026 às 10:30, Suporte escreveu:\n> Bom dia',
    'Still broken.\n\nOn Sep 9, 2026 at 10:30, Support wrote:\n> Good morning',
    'Sigue sin funcionar.\n\nEl 9 de septiembre de 2026, Soporte escribió:\n> Buenos días',
  ];

  for (const caso of casos) {
    const limpo = limparCorpoDeEmail(caso);
    assert.ok(!limpo.includes('>'), `sobrou citação em: ${limpo}`);
    assert.ok(limpo.split('\n').length <= 2, `sobrou linha demais: ${limpo}`);
  }
});

test('corta o cabeçalho de citação do Outlook', () => {
  const texto = 'Segue em anexo.\n\nDe: Suporte <s@x.com>\nEnviada: terça\nPara: Cliente\n\nBom dia';
  assert.equal(limparCorpoDeEmail(texto), 'Segue em anexo.');
});

test('corta a assinatura só quando ela está na segunda metade', () => {
  const comAssinatura =
    'Bom dia, o problema voltou a acontecer hoje de manhã, no mesmo equipamento.\n\n-- \nFulano da Silva\nTI';
  assert.equal(
    limparCorpoDeEmail(comAssinatura),
    'Bom dia, o problema voltou a acontecer hoje de manhã, no mesmo equipamento.',
  );

  // Travessão no começo de mensagem curta não é assinatura.
  const travessao = '-- \nisso aqui é o conteúdo inteiro da mensagem e precisa sobreviver';
  assert.ok(limparCorpoDeEmail(travessao).includes('precisa sobreviver'));
});

test('corta o aviso de confidencialidade', () => {
  const texto =
    'Pode fechar o chamado.\n\nEsta mensagem é confidencial e destinada apenas ao destinatário.';
  assert.equal(limparCorpoDeEmail(texto), 'Pode fechar o chamado.');
});

test('não estraga mensagem que não tem nada para cortar', () => {
  const texto = 'A impressora voltou a funcionar.\n\nObrigado pela ajuda!';
  assert.equal(limparCorpoDeEmail(texto), texto);
});

test('limpa Re:, Fwd: e o marcador do chamado no assunto', () => {
  assert.equal(limparAssunto('Re: [Norty Desk #1042] Impressora'), 'Impressora');
  assert.equal(limparAssunto('RES: Enc: Fwd: Acesso bloqueado'), 'Acesso bloqueado');
  assert.equal(limparAssunto('Assunto normal'), 'Assunto normal');
});

test('converte HTML em texto sem deixar marcação', () => {
  const html =
    '<div><p>Bom <b>dia</b>.</p><ul><li>Um</li><li>Dois</li></ul>' +
    '<script>alert(1)</script><style>.x{}</style>' +
    '<!-- comentário --><p>Or&#231;amento &amp; prazo</p></div>';
  const texto = htmlParaTexto(html);

  assert.ok(!texto.includes('<'), `sobrou marcação: ${texto}`);
  assert.ok(!texto.includes('alert'), 'o script deveria ter sido removido');
  assert.ok(!texto.includes('.x{'), 'o estilo deveria ter sido removido');
  assert.ok(!texto.includes('comentário'), 'o comentário deveria ter sido removido');
  assert.ok(texto.includes('• Um'), `a lista deveria virar marcador: ${texto}`);
  // Entidade nomeada e numérica: "Orçamento & prazo".
  assert.ok(texto.includes('Orçamento & prazo'), `entidade não decodificada: ${texto}`);
});

test('cai no HTML quando o remetente não mandou texto puro', () => {
  assert.equal(corpoDaMensagem('', '<p>Só HTML aqui.</p>'), 'Só HTML aqui.');
  assert.equal(corpoDaMensagem('Texto puro.', '<p>ignorado</p>'), 'Texto puro.');
  assert.equal(corpoDaMensagem(null, null), '');
});
