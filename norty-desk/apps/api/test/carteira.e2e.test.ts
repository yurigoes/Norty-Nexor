import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  ClienteDetail,
  ClienteView,
  Paginated,
  ProblemDetails,
  TicketListItem,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * A carteira de clientes da Norty.
 *
 * O que se prova aqui e em nenhum outro lugar: **um cliente não vê o
 * chamado de outro**. É a única coisa que, saindo errada, entrega dado
 * de uma empresa para a concorrente dela — e por isso é teste, não
 * conferência de tela.
 *
 * Prova também que o login sai do nome sem ninguém digitar, e que dois
 * homônimos não colidem.
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

async function entrar(email: string, senha?: string): Promise<Cliente> {
  const c = new Cliente(api.url);
  assert.equal((await c.entrar(email, senha)).status, 200);
  return c;
}

async function criarEmpresa(c: Cliente, name: string, emailDomain: string): Promise<ClienteDetail> {
  const r = await c.post<ClienteDetail>('/clients', { name, emailDomain });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

describe('empresa da carteira', () => {
  it('cadastra, e o domínio não se repete entre empresas', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const empresa = await criarEmpresa(supervisor, 'Empresa do João', 'empresadojoao.com.br');
    assert.equal(empresa.emailDomain, 'empresadojoao.com.br');
    assert.equal(empresa.peopleCount, 0);

    // Dois clientes com o mesmo domínio produziriam logins que colidem
    // entre empresas diferentes.
    const repetido = await supervisor.post<ProblemDetails>('/clients', {
      name: 'Outra empresa', emailDomain: 'empresadojoao.com.br',
    });
    assert.equal(repetido.status, 409, JSON.stringify(repetido.corpo));
    assert.match(repetido.corpo.detail ?? '', /colidiriam/);
  });

  it('limpa o domínio de arroba, protocolo e caminho', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const r = await supervisor.post<ClienteDetail>('/clients', {
      name: 'Empresa Suja', emailDomain: 'https://EmpresaSuja.com.br/contato',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.emailDomain, 'empresasuja.com.br');
  });

  it('recusa o que não é domínio', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const r = await supervisor.post<ProblemDetails>('/clients', {
      name: 'Sem domínio', emailDomain: 'nao é dominio',
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('não troca o domínio depois que há gente com login nele', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa Fixa', 'fixa.com.br');
    await supervisor.post(`/clients/${empresa.id}/people`, { name: 'Ana Lima' });

    const r = await supervisor.patch<ProblemDetails>(`/clients/${empresa.id}`, {
      emailDomain: 'outra.com.br',
    });
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /órf/i);
  });

  it('empresa com gente ou chamado desativa em vez de excluir', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa Com Gente', 'comgente.com.br');
    await supervisor.post(`/clients/${empresa.id}/people`, { name: 'Bruno Souza' });

    const recusa = await supervisor.del<ProblemDetails>(`/clients/${empresa.id}`);
    assert.equal(recusa.status, 409, JSON.stringify(recusa.corpo));

    assert.equal((await supervisor.patch(`/clients/${empresa.id}`, { isActive: false })).status, 200);
  });
});

describe('o login sai do nome', () => {
  it('monta yuri.goes@empresadojoao.com.br sem ninguém digitar', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa do João II', 'empresadojoao2.com.br');

    const r = await supervisor.post<ClienteDetail>(`/clients/${empresa.id}/people`, {
      name: 'Yuri Souza Goes',
      phone: '+5571999999999',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const pessoa = r.corpo.people.find((p) => p.name === 'Yuri Souza Goes');
    assert.equal(pessoa?.login, 'yuri.goes@empresadojoao2.com.br');
    // Nasce sem PIN: a pessoa o escolhe, e até lá não entra.
    assert.equal(pessoa?.pinPendente, true);
  });

  it('o homônimo ganha sufixo em vez de derrubar o primeiro', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa Homônima', 'homonima.com.br');

    await supervisor.post(`/clients/${empresa.id}/people`, { name: 'Carlos Silva' });
    const segundo = await supervisor.post<ClienteDetail>(`/clients/${empresa.id}/people`, {
      name: 'Carlos Pereira Silva',
    });
    assert.equal(segundo.status, 201, JSON.stringify(segundo.corpo));

    const logins = segundo.corpo.people.map((p) => p.login).sort();
    assert.deepEqual(logins, ['carlos.silva2@homonima.com.br', 'carlos.silva@homonima.com.br']);
  });

  it('recusa nome do qual não sai login', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa Sem Nome', 'semnome.com.br');

    const r = await supervisor.post<ProblemDetails>(`/clients/${empresa.id}/people`, { name: '...' });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });
});

describe('o PIN', () => {
  it('recusa PIN fraco e aceita o que serve', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa do PIN', 'dopin.com.br');
    const comPessoa = await supervisor.post<ClienteDetail>(`/clients/${empresa.id}/people`, {
      name: 'Diana Rocha',
    });
    const pessoa = comPessoa.corpo.people[0];

    for (const fraco of ['123456', '111111', '1234']) {
      const r = await supervisor.post<ProblemDetails>(
        `/clients/${empresa.id}/people/${pessoa.id}/pin`, { pin: fraco },
      );
      assert.ok(r.status === 400, `o PIN ${fraco} deveria ser recusado (veio ${r.status})`);
    }

    const bom = await supervisor.post<ClienteDetail>(
      `/clients/${empresa.id}/people/${pessoa.id}/pin`, { pin: '374912' },
    );
    assert.equal(bom.status, 201, JSON.stringify(bom.corpo));
    assert.equal(bom.corpo.people.find((p) => p.id === pessoa.id)?.pinPendente, false);
  });

  it('o PIN é guardado cifrado, nunca em claro', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa Cifrada', 'cifrada.com.br');
    const comPessoa = await supervisor.post<ClienteDetail>(`/clients/${empresa.id}/people`, {
      name: 'Elisa Martins',
    });
    const pessoa = comPessoa.corpo.people[0];
    await supervisor.post(`/clients/${empresa.id}/people/${pessoa.id}/pin`, { pin: '481570' });

    const naBase = await prisma.user.findUniqueOrThrow({ where: { id: pessoa.id } });
    assert.ok(!naBase.passwordHash.includes('481570'), 'o PIN está em claro no banco');
    assert.match(naBase.passwordHash, /^\$argon2id\$/);
  });
});

describe('um cliente não vê o chamado de outro', () => {
  it('cada pessoa enxerga só os chamados da própria empresa', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const joao = await criarEmpresa(supervisor, 'Empresa A', 'empresa-a.com.br');
    const maria = await criarEmpresa(supervisor, 'Empresa B', 'empresa-b.com.br');

    const doJoao = await supervisor.post<ClienteDetail>(`/clients/${joao.id}/people`, {
      name: 'Pedro Alves',
    });
    const doMaria = await supervisor.post<ClienteDetail>(`/clients/${maria.id}/people`, {
      name: 'Paula Nunes',
    });
    const pedro = doJoao.corpo.people[0];
    const paula = doMaria.corpo.people[0];

    const PIN = '739154';
    await supervisor.post(`/clients/${joao.id}/people/${pedro.id}/pin`, { pin: PIN });
    await supervisor.post(`/clients/${maria.id}/people/${paula.id}/pin`, { pin: PIN });

    // Um chamado para cada empresa, com a pessoa como requerente.
    const paraA = await prisma.ticket.create({
      data: {
        organizationId: f.organizacao.id, number: 9001, clientId: joao.id,
        subject: 'Segredo da Empresa A', description: 'Não pode aparecer para a Empresa B.',
        actors: { create: [{ role: 'REQUERENTE', userId: pedro.id }] },
      },
    });
    // Pedro entra como OBSERVADOR no chamado da Empresa B — o engano
    // que acontece de verdade, alguém somando a pessoa errada. É este
    // caso que o recorte por `clientId` defende: sem ele, o filtro por
    // ator devolveria o chamado da concorrente.
    const paraB = await prisma.ticket.create({
      data: {
        organizationId: f.organizacao.id, number: 9002, clientId: maria.id,
        subject: 'Segredo da Empresa B', description: 'Não pode aparecer para a Empresa A.',
        actors: {
          create: [
            { role: 'REQUERENTE', userId: paula.id },
            { role: 'OBSERVADOR', userId: pedro.id },
          ],
        },
      },
    });

    const comoPedro = await entrar(pedro.login, PIN);
    const fila = await comoPedro.get<Paginated<TicketListItem>>('/tickets');
    assert.equal(fila.status, 200, JSON.stringify(fila.corpo));

    const assuntos = fila.corpo.data.map((i) => i.subject);
    assert.ok(assuntos.includes('Segredo da Empresa A'), 'Pedro deveria ver o chamado da empresa dele');
    assert.ok(
      !assuntos.includes('Segredo da Empresa B'),
      'VAZOU: o chamado da Empresa B apareceu para alguém da Empresa A',
    );

    // Nem pelo caminho direto, sabendo o id.
    assert.equal((await comoPedro.get(`/tickets/${paraA.id}`)).status, 200, 'o próprio deveria abrir');
    assert.equal(
      (await comoPedro.get(`/tickets/${paraB.id}`)).status,
      404,
      'VAZOU: o chamado da outra empresa abriu pelo id, mesmo com Pedro só como observador',
    );
  });

  it('a pessoa do cliente não gerencia a carteira', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa Curiosa', 'curiosa.com.br');
    const comPessoa = await supervisor.post<ClienteDetail>(`/clients/${empresa.id}/people`, {
      name: 'Rita Campos',
    });
    const rita = comPessoa.corpo.people[0];
    const PIN = '620481';
    await supervisor.post(`/clients/${empresa.id}/people/${rita.id}/pin`, { pin: PIN });

    const comoRita = await entrar(rita.login, PIN);
    assert.equal((await comoRita.get('/clients')).status, 403);
    assert.equal(
      (await comoRita.post('/clients', { name: 'Minha', emailDomain: 'minha.com.br' })).status,
      403,
    );
  });
});

describe('a carteira na listagem', () => {
  it('conta pessoas e chamados abertos por empresa', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const empresa = await criarEmpresa(supervisor, 'Empresa Contada', 'contada.com.br');
    await supervisor.post(`/clients/${empresa.id}/people`, { name: 'Sofia Dias' });
    await supervisor.post(`/clients/${empresa.id}/people`, { name: 'Tiago Melo' });

    await prisma.ticket.create({
      data: {
        organizationId: f.organizacao.id, number: 9101, clientId: empresa.id,
        subject: 'Aberto', description: 'Conta.', status: 'NOVO',
      },
    });
    await prisma.ticket.create({
      data: {
        organizationId: f.organizacao.id, number: 9102, clientId: empresa.id,
        subject: 'Fechado', description: 'Não conta.', status: 'FECHADO',
      },
    });

    const lista = await supervisor.get<ClienteView[]>('/clients');
    const naLista = lista.corpo.find((c) => c.id === empresa.id);
    assert.equal(naLista?.peopleCount, 2);
    assert.equal(naLista?.openTickets, 1, 'chamado fechado não é chamado aberto');
  });
});
