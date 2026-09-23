import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MetaMensagemRecebida, MetaWebhookRequest } from '@norty-desk/shared';

import {
  interpretarToque,
  lerEntrega,
  listaDeChamados,
  listaDeEmpresas,
  listaEmTexto,
  listaParaMeta,
  menuDeToque,
} from './meta.mensagem';

/**
 * O formato da Meta, provado sem subir nada.
 *
 * É a parte que mais muda e a que menos se enxerga em produção: um
 * campo que trocou de lugar vira chamado que não abre, e ninguém liga a
 * causa ao efeito. Tudo aqui é função pura, então o formato inteiro se
 * verifica em milissegundos.
 */

function entrega(
  mensagens: MetaMensagemRecebida[],
  contatos: { wa_id?: string; profile?: { name?: string } }[] = [],
): MetaWebhookRequest {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '551140028922', phone_number_id: '999' },
              contacts: contatos,
              messages: mensagens,
            },
          },
        ],
      },
    ],
  };
}

describe('ler a entrega da Meta', () => {
  it('texto simples vira mensagem com telefone normalizado e nome do perfil', () => {
    const lidas = lerEntrega(
      entrega(
        [{ from: '5511999998888', id: 'wamid.AAA', timestamp: '1758000000', type: 'text', text: { body: 'A impressora parou' } }],
        [{ wa_id: '5511999998888', profile: { name: 'Marina Prado' } }],
      ),
    );

    assert.equal(lidas.length, 1);
    assert.equal(lidas[0]!.telefone, '+5511999998888');
    assert.equal(lidas[0]!.nome, 'Marina Prado');
    assert.equal(lidas[0]!.texto, 'A impressora parou');
    assert.equal(lidas[0]!.externalId, 'wamid.AAA');
  });

  it('o carimbo é lido em segundos, não em milissegundos', () => {
    const lidas = lerEntrega(
      entrega([{ from: '5511999998888', id: 'wamid.T', timestamp: '1758000000', type: 'text', text: { body: 'oi' } }]),
    );

    // Lido como milissegundos, isto cairia em 1970 — e a janela de 24 h
    // nunca abriria, porque a última entrada seria de 55 anos atrás.
    assert.equal(lidas[0]!.recebidaEm.getTime(), 1_758_000_000_000);
    assert.ok(lidas[0]!.recebidaEm.getUTCFullYear() > 2020, String(lidas[0]!.recebidaEm));
  });

  it('uma entrega com três mensagens devolve as três', () => {
    const lidas = lerEntrega(
      entrega([
        { from: '5511999998888', id: 'w1', type: 'text', text: { body: 'primeira' } },
        { from: '5511999998888', id: 'w2', type: 'text', text: { body: 'segunda' } },
        { from: '5511999998888', id: 'w3', type: 'text', text: { body: 'terceira' } },
      ]),
    );

    // Tratar a entrega como "uma mensagem" perderia as outras duas em
    // silêncio — e a pessoa juraria que mandou.
    assert.deepEqual(
      lidas.map((m) => m.texto),
      ['primeira', 'segunda', 'terceira'],
    );
  });

  it('entrega só com recibo não vira mensagem nenhuma', () => {
    const lidas = lerEntrega({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: { statuses: [{ id: 'wamid.X', status: 'delivered', recipient_id: '55119' }] },
            },
          ],
        },
      ],
    });

    assert.equal(lidas.length, 0);
  });

  it('o toque numa lista volta com o id que nós escolhemos', () => {
    const lidas = lerEntrega(
      entrega([
        {
          from: '5511999998888',
          id: 'wamid.I',
          type: 'interactive',
          interactive: {
            type: 'list_reply',
            list_reply: { id: 'empresa:abc-123', title: 'Padaria do João' },
          },
        },
      ]),
    );

    assert.equal(lidas[0]!.toque, 'empresa:abc-123');
    // E o título vira texto, para o diagnóstico mostrar o que a pessoa
    // escolheu em vez de um id.
    assert.equal(lidas[0]!.texto, 'Padaria do João');
  });

  it('áudio e documento viram referência de mídia; a legenda vira texto', () => {
    const lidas = lerEntrega(
      entrega([
        {
          from: '5511999998888',
          id: 'w-audio',
          type: 'audio',
          audio: { id: 'media-1', mime_type: 'audio/ogg; codecs=opus', voice: true },
        },
        {
          from: '5511999998888',
          id: 'w-doc',
          type: 'document',
          document: {
            id: 'media-2',
            mime_type: 'application/pdf',
            filename: 'nota-fiscal.pdf',
            caption: 'segue a nota',
          },
        },
      ]),
    );

    assert.equal(lidas[0]!.midia?.id, 'media-1');
    assert.equal(lidas[0]!.midia?.ehAudio, true);

    assert.equal(lidas[1]!.midia?.id, 'media-2');
    assert.equal(lidas[1]!.midia?.filename, 'nota-fiscal.pdf');
    assert.equal(lidas[1]!.midia?.ehAudio, false);
    assert.equal(lidas[1]!.texto, 'segue a nota');
  });

  it('localização vira endereço legível, e não um arquivo', () => {
    const lidas = lerEntrega(
      entrega([
        {
          from: '5511999998888',
          id: 'w-loc',
          type: 'location',
          location: { latitude: -23.5, longitude: -46.6, name: 'Filial Centro' },
        },
      ]),
    );

    assert.ok(lidas[0]!.texto?.includes('Filial Centro'), lidas[0]!.texto);
    assert.equal(lidas[0]!.midia, undefined);
  });

  it('tipo desconhecido não some: a mensagem existe', () => {
    const lidas = lerEntrega(
      entrega([{ from: '5511999998888', id: 'w-x', type: 'sticker', sticker: { id: 'm' } }]),
    );

    // Descartar em silêncio faria a pessoa achar que mandou e ninguém
    // viu.
    assert.equal(lidas.length, 1);
    assert.equal(lidas[0]!.tipo, 'sticker');
  });

  it('mensagem sem id ou sem remetente é descartada', () => {
    const lidas = lerEntrega(
      entrega([{ id: 'sem-from', type: 'text', text: { body: 'x' } }, { from: '55119', type: 'text' }]),
    );

    assert.equal(lidas.length, 0);
  });
});

describe('o que o bot manda', () => {
  it('"ver meus chamados" só aparece quando há chamados', () => {
    const semNada = menuDeToque(false).secoes[0]!.linhas.map((l) => l.id);
    const comAlgum = menuDeToque(true).secoes[0]!.linhas.map((l) => l.id);

    // Um menu que oferece o que não existe faz a pessoa tocar, receber
    // "você não tem nada", e aprender a não tocar mais.
    assert.equal(semNada.includes('menu:status'), false);
    assert.ok(comAlgum.includes('menu:status'));
  });

  it('a lista corta todo campo nos limites que a Meta recusa', () => {
    const lista = listaDeChamados([
      {
        number: 1042,
        subject: 'Impressora da recepção parou de puxar papel desde ontem à tarde',
        status: 'x'.repeat(200),
      },
    ]);

    const pronta = listaParaMeta(lista) as {
      action: { button: string; sections: { rows: { title: string; description?: string }[] }[] };
    };

    const linha = pronta.action.sections[0]!.rows[0]!;
    assert.ok(linha.title.length <= 24, linha.title);
    assert.ok((linha.description ?? '').length <= 72);
    assert.ok(pronta.action.button.length <= 20);
  });

  it('o limite de dez linhas é da mensagem inteira, não de cada seção', () => {
    const lista = {
      corpo: 'escolha',
      botao: 'Ver',
      secoes: [
        { linhas: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, titulo: `A${i}` })) },
        { linhas: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, titulo: `B${i}` })) },
      ],
    };

    const pronta = listaParaMeta(lista) as {
      action: { sections: { rows: unknown[] }[] };
    };

    const total = pronta.action.sections.reduce((soma, s) => soma + s.rows.length, 0);
    // Contar por seção deixaria passar 12, e a Meta recusaria a
    // mensagem inteira com um 400 que não diz qual campo passou.
    assert.equal(total, 10);
  });

  it('toda lista tem uma versão escrita com as mesmas opções', () => {
    const texto = listaEmTexto(
      listaDeEmpresas([
        { id: 'a', nome: 'Padaria do João' },
        { id: 'b', nome: 'Transportadora Sol' },
      ]),
    );

    // É o que sai pela Evolution, que não desenha lista, e o que fica
    // legível no banco. Um payload sem texto equivalente seria uma
    // mensagem que ninguém consegue ler depois.
    assert.ok(texto.includes('Padaria do João'), texto);
    assert.ok(texto.includes('Transportadora Sol'), texto);
  });
});

describe('interpretar o toque', () => {
  it('reconhece cada opção e carrega o que ela leva junto', () => {
    assert.deepEqual(interpretarToque('menu:novo'), { tipo: 'NOVO' });
    assert.deepEqual(interpretarToque('menu:status'), { tipo: 'STATUS' });
    assert.deepEqual(interpretarToque('menu:atendente'), { tipo: 'ATENDENTE' });
    assert.deepEqual(interpretarToque('empresa:abc-123'), { tipo: 'EMPRESA', clientId: 'abc-123' });
    assert.deepEqual(interpretarToque('chamado:1042'), { tipo: 'CHAMADO', numero: 1042 });
  });

  it('recusa o que não reconhece em vez de adivinhar', () => {
    assert.equal(interpretarToque(undefined), null);
    assert.equal(interpretarToque(''), null);
    assert.equal(interpretarToque('empresa:'), null);
    assert.equal(interpretarToque('chamado:abc'), null);
    assert.equal(interpretarToque('chamado:-3'), null);
    assert.equal(interpretarToque('qualquer coisa'), null);
  });
});
