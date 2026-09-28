import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { BuscaSalvaView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Busca salva compartilhada.
 *
 * A busca salva nasceu privada. Compartilhá-la é o `is_private` do GLPI
 * com um degrau a mais, porque o Desk tem times e o GLPI não: lá a busca
 * pública aparece para a entidade inteira, que numa central de vinte
 * pessoas é o mesmo que aparecer para quem não trabalha naquilo.
 *
 * O que se prova aqui:
 *
 * 1. **Quem vê o quê.** A do time aparece para o time e some para quem
 *    saiu dele; a da casa aparece para todos; a privada para ninguém
 *    mais.
 * 2. **Quem pode compartilhar.** Com o time, o gerente dele; com a
 *    organização, quem tem a permissão. Esconder o botão é conveniência,
 *    o guard é a proteção.
 * 3. **Usar não é mudar.** Quem recebe a busca do time abre e marca como
 *    padrão; renomear e apagar são do dono.
 * 4. **A padrão é de cada um**, e a mesma busca compartilhada pode ser a
 *    padrão de uma pessoa e não da outra — que é a razão de ela ter
 *    saído da coluna e virado tabela.
 */

let api: Api;
let f: Fixtura;

/** Gerente do time Suporte. */
let gerente: Cliente;
/** Do mesmo time, sem gerenciar. */
let colega: Cliente;
/** De outro time. */
let deFora: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();

  // A supervisora gerencia o Suporte; o agente é do time, sem gerenciar.
  await prisma.teamMember.update({
    where: { teamId_userId: { teamId: f.time.id, userId: f.supervisor.id } },
    data: { isManager: true },
  });

  // E o de fora gerencia o time dele. É o que permite provar posse sem
  // que o resultado venha por acaso do "não é gerente": alguém que
  // **passaria** na regra de alcance e mesmo assim não pode mexer na
  // busca de outro.
  await prisma.teamMember.update({
    where: { teamId_userId: { teamId: f.outroTime.id, userId: f.outroAgente.id } },
    data: { isManager: true },
  });

  api = await subirApi();

  gerente = new Cliente(api.url);
  assert.equal((await gerente.entrar('supervisor@teste.dev')).status, 200);

  colega = new Cliente(api.url);
  assert.equal((await colega.entrar('agente@teste.dev')).status, 200);

  deFora = new Cliente(api.url);
  assert.equal((await deFora.entrar('agente2@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function salvar(
  cliente: Cliente,
  name: string,
  extra: Record<string, unknown> = {},
  filtro: Record<string, unknown> = { status: ['NOVO'] },
) {
  return cliente.post<BuscaSalvaView[]>('/saved-searches', { name, filtro, ...extra });
}

const nomes = (lista: BuscaSalvaView[]) => lista.map((b) => b.name).sort();

// ---------------------------------------------------------------------

describe('compartilhar com o time', () => {
  it('o gerente do time pode', async () => {
    const criada = await salvar(gerente, 'Fila de campo', {
      shareKind: 'TIME',
      teamId: f.time.id,
    });

    assert.equal(criada.status, 201, JSON.stringify(criada.corpo));

    const minha = criada.corpo.find((b) => b.name === 'Fila de campo');
    assert.ok(minha);
    assert.equal(minha.shareKind, 'TIME');
    assert.equal(minha.team?.name, 'Suporte');
    assert.equal(minha.isMine, true);
  });

  it('quem é do time a enxerga, com o dono na ficha', async () => {
    const lista = await colega.get<BuscaSalvaView[]>('/saved-searches');
    assert.equal(lista.status, 200);

    const dela = lista.corpo.find((b) => b.name === 'Fila de campo');
    assert.ok(dela, JSON.stringify(nomes(lista.corpo)));

    // A tela precisa saber de quem é para decidir o que oferecer.
    assert.equal(dela.isMine, false);
    assert.equal(dela.owner.name, 'Supervisora');
  });

  it('quem não é do time não a enxerga', async () => {
    const lista = await deFora.get<BuscaSalvaView[]>('/saved-searches');

    assert.ok(!lista.corpo.some((b) => b.name === 'Fila de campo'), JSON.stringify(nomes(lista.corpo)));
  });

  it('quem só é do time, sem gerenciar, não compartilha com ele', async () => {
    // Um agente qualquer podendo criar aba para os colegas enche a barra
    // com a ideia de uma pessoa só.
    const recusada = await salvar(colega, 'Minha ideia para todos', {
      shareKind: 'TIME',
      teamId: f.time.id,
    });

    assert.equal(recusada.status, 403, JSON.stringify(recusada.corpo));
    assert.match((recusada.corpo as { detail?: string }).detail ?? '', /gerencia o time/);
  });

  it('nem com um time de que não participa', async () => {
    const recusada = await salvar(gerente, 'Na fila dos outros', {
      shareKind: 'TIME',
      teamId: f.outroTime.id,
    });

    // A supervisora tem a permissão da casa, então pode — quem pode
    // compartilhar com todos pode com alguns. Quem não tem, não.
    assert.equal(recusada.status, 201, JSON.stringify(recusada.corpo));

    const semPermissao = await salvar(colega, 'Na fila dos outros também', {
      shareKind: 'TIME',
      teamId: f.outroTime.id,
    });

    assert.equal(semPermissao.status, 403, JSON.stringify(semPermissao.corpo));
  });

  it('exige dizer qual time', async () => {
    const recusada = await salvar(gerente, 'Time nenhum', { shareKind: 'TIME' });

    assert.equal(recusada.status, 400, JSON.stringify(recusada.corpo));
  });

  it('recusa time de outra organização', async () => {
    const dolugarerrado = await prisma.team.create({
      data: { organizationId: f.outra.id, name: 'Time da outra' },
      select: { id: true },
    });

    const recusada = await salvar(gerente, 'Time alheio', {
      shareKind: 'TIME',
      teamId: dolugarerrado.id,
    });

    assert.equal(recusada.status, 400, JSON.stringify(recusada.corpo));
  });

  it('recusa busca privada apontando para um time', async () => {
    // O `CHECK` da migração recusaria a linha; a mensagem sai antes.
    const recusada = await salvar(gerente, 'Privada com time', {
      shareKind: 'PRIVADA',
      teamId: f.time.id,
    });

    assert.equal(recusada.status, 400, JSON.stringify(recusada.corpo));
  });
});

describe('compartilhar com a casa', () => {
  it('quem tem a permissão pode, e todo mundo vê', async () => {
    const criada = await salvar(gerente, 'Triagem da casa', { shareKind: 'ORGANIZACAO' });
    assert.equal(criada.status, 201, JSON.stringify(criada.corpo));

    for (const quem of [colega, deFora]) {
      const lista = await quem.get<BuscaSalvaView[]>('/saved-searches');
      const vista = lista.corpo.find((b) => b.name === 'Triagem da casa');

      assert.ok(vista, JSON.stringify(nomes(lista.corpo)));
      assert.equal(vista.shareKind, 'ORGANIZACAO');
      assert.equal(vista.team, null);
      assert.equal(vista.isMine, false);
    }
  });

  it('quem não tem, não', async () => {
    const recusada = await salvar(colega, 'Minha para a casa', { shareKind: 'ORGANIZACAO' });

    assert.equal(recusada.status, 403, JSON.stringify(recusada.corpo));
    assert.match((recusada.corpo as { detail?: string }).detail ?? '', /responde pela central/);
  });

  it('não atravessa organização', async () => {
    // A busca da casa é da **minha** casa. O forasteiro é da outra.
    const forasteiro = new Cliente(api.url);
    assert.equal((await forasteiro.entrar('forasteiro@teste.dev')).status, 200);

    const lista = await forasteiro.get<BuscaSalvaView[]>('/saved-searches');

    assert.deepEqual(lista.corpo, []);
  });
});

describe('usar a busca do outro não é mudá-la', () => {
  it('quem recebe não renomeia', async () => {
    const lista = await colega.get<BuscaSalvaView[]>('/saved-searches');
    const doTime = lista.corpo.find((b) => b.name === 'Fila de campo');
    assert.ok(doTime);

    const recusada = await colega.patch(`/saved-searches/${doTime.id}`, { name: 'Minha agora' });

    assert.equal(recusada.status, 403, JSON.stringify(recusada.corpo));
    assert.match((recusada.corpo as { detail?: string }).detail ?? '', /salve uma cópia sua/);
  });

  it('quem recebe não refiltra nem reabre o alcance', async () => {
    const lista = await colega.get<BuscaSalvaView[]>('/saved-searches');
    const doTime = lista.corpo.find((b) => b.name === 'Fila de campo');
    assert.ok(doTime);

    const filtro = await colega.patch(`/saved-searches/${doTime.id}`, {
      filtro: { slaBreached: true },
    });
    assert.equal(filtro.status, 403);

    const alcance = await colega.patch(`/saved-searches/${doTime.id}`, {
      shareKind: 'ORGANIZACAO',
    });
    assert.equal(alcance.status, 403);
  });

  it('nem o gerente do time reescreve a busca que não é dele', async () => {
    // O caso que prova **posse**, e não o "não é gerente" de tabela: o de
    // fora gerencia o time em que esta busca está, então passaria na
    // regra de alcance. Mesmo assim a busca é de quem a criou.
    const lista = await deFora.get<BuscaSalvaView[]>('/saved-searches');
    const noMeuTime = lista.corpo.find((b) => b.name === 'Na fila dos outros');
    assert.ok(noMeuTime, JSON.stringify(nomes(lista.corpo)));
    assert.equal(noMeuTime.isMine, false);

    const recusada = await deFora.patch(`/saved-searches/${noMeuTime.id}`, {
      filtro: { slaBreached: true },
    });

    assert.equal(recusada.status, 403, JSON.stringify(recusada.corpo));

    // E o filtro não mudou.
    const depois = await deFora.get<BuscaSalvaView[]>('/saved-searches');
    assert.deepEqual(
      depois.corpo.find((b) => b.id === noMeuTime.id)?.filtro,
      noMeuTime.filtro,
    );
  });

  it('quem recebe não apaga', async () => {
    const lista = await colega.get<BuscaSalvaView[]>('/saved-searches');
    const doTime = lista.corpo.find((b) => b.name === 'Fila de campo');
    assert.ok(doTime);

    const recusada = await colega.del(`/saved-searches/${doTime.id}`);

    assert.equal(recusada.status, 403, JSON.stringify(recusada.corpo));

    // E continua lá.
    const depois = await colega.get<BuscaSalvaView[]>('/saved-searches');
    assert.ok(depois.corpo.some((b) => b.id === doTime.id));
  });

  it('a ordem só mexe nas próprias', async () => {
    const lista = await colega.get<BuscaSalvaView[]>('/saved-searches');
    const doTime = lista.corpo.find((b) => b.name === 'Fila de campo');
    assert.ok(doTime);

    const recusada = await colega.put('/saved-searches/ordem', { ids: [doTime.id] });

    assert.equal(recusada.status, 400, JSON.stringify(recusada.corpo));
  });

  it('o dono continua podendo tudo', async () => {
    const lista = await gerente.get<BuscaSalvaView[]>('/saved-searches');
    const minha = lista.corpo.find((b) => b.name === 'Fila de campo');
    assert.ok(minha);

    const renomeada = await gerente.patch<BuscaSalvaView[]>(`/saved-searches/${minha.id}`, {
      name: 'Fila de campo (2026)',
    });

    assert.equal(renomeada.status, 200, JSON.stringify(renomeada.corpo));
    assert.ok(renomeada.corpo.some((b) => b.name === 'Fila de campo (2026)'));
  });
});

describe('a padrão é de cada um', () => {
  it('a mesma busca compartilhada é padrão de um e não do outro', async () => {
    // É a razão de `isDefault` ter saído da coluna e virado tabela:
    // assim que a busca é vista por várias pessoas, "é a minha padrão"
    // vira fato de cada uma.
    const lista = await colega.get<BuscaSalvaView[]>('/saved-searches');
    const daCasa = lista.corpo.find((b) => b.name === 'Triagem da casa');
    assert.ok(daCasa);

    const marcada = await colega.patch<BuscaSalvaView[]>(`/saved-searches/${daCasa.id}`, {
      isDefault: true,
    });

    assert.equal(marcada.status, 200, JSON.stringify(marcada.corpo));
    assert.equal(marcada.corpo.find((b) => b.id === daCasa.id)?.isDefault, true);

    // Para o dono dela, continua não sendo a padrão.
    const doDono = await gerente.get<BuscaSalvaView[]>('/saved-searches');
    assert.equal(doDono.corpo.find((b) => b.id === daCasa.id)?.isDefault, false);
  });

  it('marcar outra troca, sem deixar duas', async () => {
    const lista = await colega.get<BuscaSalvaView[]>('/saved-searches');
    const outra = lista.corpo.find((b) => b.name === 'Fila de campo (2026)');
    assert.ok(outra);

    const trocada = await colega.patch<BuscaSalvaView[]>(`/saved-searches/${outra.id}`, {
      isDefault: true,
    });

    assert.equal(trocada.status, 200);

    const padroes = trocada.corpo.filter((b) => b.isDefault);
    assert.deepEqual(
      padroes.map((b) => b.name),
      ['Fila de campo (2026)'],
    );

    // A chave primária `(organização, pessoa)` é a regra, agora no banco.
    const linhas = await prisma.savedSearchDefault.count({
      where: { organizationId: f.organizacao.id, userId: f.agente.id },
    });
    assert.equal(linhas, 1);
  });

  it('apagar a busca tira a padrão de quem a tinha escolhido', async () => {
    const lista = await gerente.get<BuscaSalvaView[]>('/saved-searches');
    const doTime = lista.corpo.find((b) => b.name === 'Fila de campo (2026)');
    assert.ok(doTime);

    // O colega a tinha como padrão; o dono apaga.
    const apagada = await gerente.del<BuscaSalvaView[]>(`/saved-searches/${doTime.id}`);
    assert.equal(apagada.status, 200, JSON.stringify(apagada.corpo));

    // Sem a cascata, sobraria linha apontando para busca que não existe,
    // e a fila abriria em nada.
    const sobrou = await prisma.savedSearchDefault.count({
      where: { savedSearchId: doTime.id },
    });
    assert.equal(sobrou, 0);

    const doColega = await colega.get<BuscaSalvaView[]>('/saved-searches');
    assert.equal(doColega.corpo.filter((b) => b.isDefault).length, 0);
  });
});

describe('sair do time', () => {
  it('tira a busca da lista de quem saiu', async () => {
    const antes = await colega.get<BuscaSalvaView[]>('/saved-searches');
    const quantasDoTime = antes.corpo.filter((b) => b.shareKind === 'TIME').length;

    const nova = await salvar(gerente, 'Só do Suporte', {
      shareKind: 'TIME',
      teamId: f.time.id,
    });
    assert.equal(nova.status, 201, JSON.stringify(nova.corpo));

    const comOTime = await colega.get<BuscaSalvaView[]>('/saved-searches');
    assert.equal(comOTime.corpo.filter((b) => b.shareKind === 'TIME').length, quantasDoTime + 1);

    // Sai do time, e o token seguinte já não traz aquele time.
    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: f.time.id, userId: f.agente.id } },
    });

    const semTime = new Cliente(api.url);
    assert.equal((await semTime.entrar('agente@teste.dev')).status, 200);

    const depois = await semTime.get<BuscaSalvaView[]>('/saved-searches');
    assert.ok(!depois.corpo.some((b) => b.name === 'Só do Suporte'), JSON.stringify(nomes(depois.corpo)));
  });

  it('apagar o time leva a busca dele junto', async () => {
    const time = await prisma.team.create({
      data: { organizationId: f.organizacao.id, name: 'Passageiro' },
      select: { id: true },
    });

    const busca = await prisma.savedSearch.create({
      data: {
        organizationId: f.organizacao.id,
        userId: f.supervisor.id,
        name: 'Vai com o time',
        query: {},
        shareKind: 'TIME',
        teamId: time.id,
      },
      select: { id: true },
    });

    await prisma.team.delete({ where: { id: time.id } });

    // Busca de time sem time não é privada nem da casa: é uma aba que
    // ninguém sabe de quem é, e o `CHECK` a recusaria.
    const sobrou = await prisma.savedSearch.count({ where: { id: busca.id } });
    assert.equal(sobrou, 0);
  });
});

describe('o banco recusa o que a API recusaria', () => {
  it('não aceita busca de time sem time', async () => {
    // Por SQL cru, passando por cima do serviço: a cerca de baixo é o
    // `CHECK`, e é ele que se quer ver recusar.
    await assert.rejects(
      prisma.$executeRawUnsafe(
        `INSERT INTO "saved_searches" ("id","organizationId","userId","name","query","shareKind","updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'Torta', '{}'::jsonb, 'TIME', now())`,
        f.organizacao.id,
        f.supervisor.id,
      ),
    );

    assert.equal(await prisma.savedSearch.count({ where: { name: 'Torta' } }), 0);
  });

  it('não aceita busca privada com time', async () => {
    await assert.rejects(
      prisma.$executeRawUnsafe(
        `INSERT INTO "saved_searches" ("id","organizationId","userId","name","query","shareKind","teamId","updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'Torta 2', '{}'::jsonb, 'PRIVADA', $3, now())`,
        f.organizacao.id,
        f.supervisor.id,
        f.time.id,
      ),
    );

    assert.equal(await prisma.savedSearch.count({ where: { name: 'Torta 2' } }), 0);
  });

  it('não aceita duas padrão para a mesma pessoa', async () => {
    // A chave primária `(organizationId, userId)` **é** a regra. Antes
    // ela vivia só numa transação do serviço.
    const buscas = await prisma.savedSearch.findMany({
      where: { organizationId: f.organizacao.id, userId: f.supervisor.id },
      select: { id: true },
      take: 2,
    });

    assert.equal(buscas.length, 2, 'o teste precisa de duas buscas');

    await prisma.savedSearchDefault.deleteMany({
      where: { organizationId: f.organizacao.id, userId: f.supervisor.id },
    });

    await prisma.savedSearchDefault.create({
      data: {
        organizationId: f.organizacao.id,
        userId: f.supervisor.id,
        savedSearchId: buscas[0]!.id,
      },
    });

    await assert.rejects(
      prisma.savedSearchDefault.create({
        data: {
          organizationId: f.organizacao.id,
          userId: f.supervisor.id,
          savedSearchId: buscas[1]!.id,
        },
      }),
    );
  });
});
