import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Paginated, TicketDetail, TicketListItem } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * A busca da fila.
 *
 * Havia um índice GIN em `tickets` desde o começo e a busca nunca o
 * usou: `contains` vira `ILIKE '%termo%'`, que nenhum índice de texto
 * atende. Esta suíte protege as duas coisas que a troca não pode
 * quebrar — achar pelo texto e achar pelo número — e acrescenta a
 * terceira que ela trouxe: achar pelo protocolo.
 *
 * Também prova a diferença que só a busca por índice dá: "impressoras"
 * acha "impressora", porque o radical é o mesmo. `ILIKE` nunca achou.
 */

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function entrar(email: string): Promise<Cliente> {
  const c = new Cliente(api.url);
  assert.equal((await c.entrar(email)).status, 200, `login de ${email} falhou`);
  return c;
}

async function abrir(c: Cliente, subject: string, description: string): Promise<TicketDetail> {
  const r = await c.post<TicketDetail>('/tickets', {
    subject,
    description,
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

const buscar = (c: Cliente, termo: string) =>
  c.get<Paginated<TicketListItem>>(`/tickets?q=${encodeURIComponent(termo)}`);

describe('busca na fila', () => {
  it('acha pelo assunto e pela descrição', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const daImpressora = await abrir(
      supervisor,
      'Impressora do segundo andar não imprime',
      'A luz laranja fica piscando desde a manhã de terça.',
    );
    await abrir(supervisor, 'Notebook não liga', 'Tela preta, sem nenhum sinal de vida.');

    const porAssunto = await buscar(supervisor, 'impressora');
    assert.equal(porAssunto.status, 200, JSON.stringify(porAssunto.corpo));
    assert.ok(
      porAssunto.corpo.data.some((t) => t.id === daImpressora.id),
      'deveria achar pelo assunto',
    );

    const porDescricao = await buscar(supervisor, 'laranja piscando');
    assert.ok(
      porDescricao.corpo.data.some((t) => t.id === daImpressora.id),
      'deveria achar pela descrição',
    );
  });

  it('acha pelo radical: "impressoras" encontra "impressora"', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrir(
      supervisor,
      'Trocar o toner da impressora',
      'O toner acabou no meio de uma impressão.',
    );

    // É o que o índice dá e o `ILIKE '%impressoras%'` nunca deu: a
    // busca em português reduz ao radical antes de comparar.
    const r = await buscar(supervisor, 'impressoras');
    assert.ok(
      r.corpo.data.some((t) => t.id === chamado.id),
      'a busca por radical deveria achar o singular',
    );
  });

  it('não devolve o que não casa', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    await abrir(supervisor, 'Ar-condicionado pingando', 'Água no carpete da sala 3.');

    const r = await buscar(supervisor, 'xilofone');
    assert.equal(r.corpo.data.length, 0, JSON.stringify(r.corpo.data.map((t) => t.subject)));
  });

  it('acha pelo número, com e sem cerquilha', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrir(supervisor, 'Chamado com número', 'Texto qualquer.');

    for (const termo of [String(chamado.number), `#${chamado.number}`]) {
      const r = await buscar(supervisor, termo);
      assert.ok(
        r.corpo.data.some((t) => t.id === chamado.id),
        `deveria achar por "${termo}"`,
      );
    }
  });

  it('acha pelo protocolo, com e sem traço', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrir(supervisor, 'Chamado com protocolo', 'Texto qualquer.');

    const { protocol } = await prisma.ticket.findUniqueOrThrow({
      where: { id: chamado.id },
      select: { protocol: true },
    });

    // Quem cola um protocolo está procurando aquele chamado, não texto
    // parecido com ele.
    for (const termo of [protocol, `${protocol.slice(0, 4)}-${protocol.slice(4)}`]) {
      const r = await buscar(supervisor, termo);
      assert.ok(
        r.corpo.data.some((t) => t.id === chamado.id),
        `deveria achar pelo protocolo "${termo}"`,
      );
    }
  });

  it('a busca não fura o escopo de leitura', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const segredo = await abrir(
      supervisor,
      'Rescisão do contrato do fornecedor',
      'Tratativa com o jurídico sobre a rescisão.',
    );

    // `agente2` é de outro time e não é ator deste chamado: buscar não
    // pode ser a porta dos fundos do escopo de leitura.
    const outro = await entrar('agente2@teste.dev');
    const r = await buscar(outro, 'rescisão');
    assert.ok(
      !r.corpo.data.some((t) => t.id === segredo.id),
      'a busca devolveu chamado fora do escopo de leitura',
    );
  });

  it('a busca convive com os outros filtros da fila', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrir(supervisor, 'Servidor de arquivos lento', 'Demora para abrir.');
    assert.equal((await supervisor.post(`/tickets/${chamado.id}/fechar`)).status, 201);
    await abrir(supervisor, 'Servidor de impressão lento', 'Fila travada.');

    const abertos = await supervisor.get<Paginated<TicketListItem>>(
      '/tickets?q=servidor&status=NOVO&status=ATRIBUIDO',
    );
    assert.equal(abertos.status, 200, JSON.stringify(abertos.corpo));
    assert.ok(
      !abertos.corpo.data.some((t) => t.id === chamado.id),
      'o filtro de status deveria continuar valendo junto com a busca',
    );
    assert.ok(abertos.corpo.data.length > 0, 'o outro servidor deveria aparecer');
  });

  it('termo só de pontuação não derruba a consulta', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    // `to_tsvector` de pontuação é vazio, e `string_agg` de nada é
    // `NULL`: sem o `nullif`, o `to_tsquery` receberia string vazia e
    // a consulta morreria com erro de sintaxe.
    for (const termo of ['...', '!!!', '   ']) {
      const r = await buscar(supervisor, termo);
      assert.equal(r.status, 200, `"${termo}" derrubou a busca: ${JSON.stringify(r.corpo)}`);
    }
  });
});
