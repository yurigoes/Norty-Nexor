import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  AssetDetail,
  AssetView,
  ComponenteView,
  FabricanteView,
  ProblemDetails,
} from '@norty-desk/shared';
import { emCapacidade, resumoDoHardware } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Componentes do ativo.
 *
 * O que se prova aqui e em nenhum outro lugar: a ficha de atributos é
 * validada pelo tipo do componente, e a mensagem que volta é a do campo
 * — não "attributes inválido"; trocar o tipo troca a ficha inteira, em
 * vez de guardar a antiga escondida; e a soma da máquina sai de linhas
 * de verdade, que é a pergunta que o GLPI não responde sem exportar
 * dezessete tabelas.
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
  assert.equal((await c.entrar(email)).status, 200);
  return c;
}

async function criarAtivo(cliente: Cliente, name: string): Promise<AssetView> {
  const r = await cliente.post<AssetView>('/assets', { name, kind: 'COMPUTADOR' });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

describe('a ficha de atributos vale pelo tipo', () => {
  it('cobra o obrigatório com o nome do campo, não com "attributes inválido"', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação sem memória');

    const r = await supervisor.post<ProblemDetails>(`/assets/${ativo.id}/components`, {
      kind: 'MEMORIA',
      name: 'Kingston',
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.detail ?? r.corpo.title ?? '', /Capacidade/);
  });

  it('recusa campo que não está na ficha daquele tipo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação com campo inventado');

    const r = await supervisor.post<ProblemDetails>(`/assets/${ativo.id}/components`, {
      kind: 'DISCO',
      name: 'Samsung 980',
      // "frequencia" é de memória, não de disco.
      attributes: { capacidade: 512, frequencia: 3200 },
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.detail ?? r.corpo.title ?? '', /desconhecido/i);
  });

  it('recusa opção fora da lista do tipo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação com disquete');

    const r = await supervisor.post<ProblemDetails>(`/assets/${ativo.id}/components`, {
      kind: 'DISCO',
      name: 'Genérico',
      attributes: { capacidade: 20, tecnologia: 'disquete' },
    });

    assert.equal(r.status, 400);
  });

  it('aceita o tipo sem ficha nenhuma, com atributos vazios', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação com leitor');

    const r = await supervisor.post<ComponenteView[]>(`/assets/${ativo.id}/components`, {
      kind: 'OUTRO',
      name: 'Leitor biométrico',
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual(r.corpo[0].attributes, {});
  });
});

describe('o que a máquina tem', () => {
  it('uma linha é uma peça: dois pentes de 8 GB somam 16 GB', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação da contabilidade');

    for (const slot of ['A1', 'A2']) {
      const r = await supervisor.post<ComponenteView[]>(`/assets/${ativo.id}/components`, {
        kind: 'MEMORIA',
        name: 'Kingston KVR26N19S8',
        attributes: { capacidade: 8192, tecnologia: 'DDR4', frequencia: 2666, slot },
      });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
    }

    const disco = await supervisor.post<ComponenteView[]>(`/assets/${ativo.id}/components`, {
      kind: 'DISCO',
      name: 'Samsung 980',
      attributes: { capacidade: 512, tecnologia: 'NVMe' },
    });
    assert.equal(disco.status, 201);

    const detalhe = await supervisor.get<AssetDetail>(`/assets/${ativo.id}`);
    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.corpo.components.length, 3);

    // A soma sai da mesma função que a tela usa.
    const resumo = resumoDoHardware(detalhe.corpo.components);
    assert.equal(emCapacidade(resumo.memoriaMB), '16 GB');
    assert.equal(emCapacidade(resumo.armazenamentoMB), '512 GB');
  });

  it('a mesma série de peça não entra duas vezes na organização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const um = await criarAtivo(supervisor, 'Estação origem');
    const outro = await criarAtivo(supervisor, 'Estação destino');

    const primeiro = await supervisor.post<ComponenteView[]>(`/assets/${um.id}/components`, {
      kind: 'DISCO',
      name: 'Samsung 980',
      serialNumber: 'S5GXNF0T123456',
      attributes: { capacidade: 1024 },
    });
    assert.equal(primeiro.status, 201);

    // A mesma peça "aparecendo" em duas máquinas é como a memória da
    // frota dobra sozinha.
    const repetido = await supervisor.post<ProblemDetails>(`/assets/${outro.id}/components`, {
      kind: 'DISCO',
      name: 'Samsung 980',
      serialNumber: 'S5GXNF0T123456',
      attributes: { capacidade: 1024 },
    });
    assert.equal(repetido.status, 409, JSON.stringify(repetido.corpo));
  });

  it('apagar o ativo leva os componentes junto', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação que será baixada');

    await supervisor.post(`/assets/${ativo.id}/components`, {
      kind: 'FONTE',
      name: 'Corsair',
      attributes: { potencia: 500 },
    });

    await prisma.asset.delete({ where: { id: ativo.id } });

    const sobrou = await prisma.assetComponent.count({ where: { assetId: ativo.id } });
    assert.equal(sobrou, 0);
  });
});

describe('editar e apagar a peça', () => {
  it('trocar o tipo troca a ficha inteira, sem guardar a antiga escondida', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação remontada');

    const criados = await supervisor.post<ComponenteView[]>(`/assets/${ativo.id}/components`, {
      kind: 'MEMORIA',
      name: 'Peça trocada',
      attributes: { capacidade: 4096, frequencia: 1600 },
    });
    const peca = criados.corpo[0];

    const r = await supervisor.patch<ComponenteView[]>(
      `/assets/${ativo.id}/components/${peca.id}`,
      { kind: 'DISCO', attributes: { capacidade: 256, tecnologia: 'SSD' } },
    );
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const editada = r.corpo.find((c) => c.id === peca.id);
    assert.equal(editada?.kind, 'DISCO');
    // A frequência de memória não sobreviveu escondida dentro do disco.
    assert.deepEqual(editada?.attributes, { capacidade: 256, tecnologia: 'SSD' });
  });

  it('trocar o tipo sem mandar a ficha nova cobra o obrigatório do tipo novo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação meio trocada');

    const criados = await supervisor.post<ComponenteView[]>(`/assets/${ativo.id}/components`, {
      kind: 'OUTRO',
      name: 'Peça indefinida',
    });
    const peca = criados.corpo[0];

    const r = await supervisor.patch<ProblemDetails>(
      `/assets/${ativo.id}/components/${peca.id}`,
      { kind: 'MEMORIA' },
    );
    assert.equal(r.status, 400);
    assert.match(r.corpo.detail ?? r.corpo.title ?? '', /Capacidade/);
  });

  it('editar sem tocar na ficha mantém os atributos', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação renomeada');

    const criados = await supervisor.post<ComponenteView[]>(`/assets/${ativo.id}/components`, {
      kind: 'MEMORIA',
      name: 'Nome errado',
      attributes: { capacidade: 16384, tecnologia: 'DDR4' },
    });
    const peca = criados.corpo[0];

    const r = await supervisor.patch<ComponenteView[]>(
      `/assets/${ativo.id}/components/${peca.id}`,
      { name: 'Kingston KVR26N19D8' },
    );
    assert.equal(r.status, 200);

    const editada = r.corpo.find((c) => c.id === peca.id);
    assert.equal(editada?.name, 'Kingston KVR26N19D8');
    assert.deepEqual(editada?.attributes, { capacidade: 16384, tecnologia: 'DDR4' });
  });

  it('apagar a peça devolve a lista sem ela', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação com peça a menos');

    const criados = await supervisor.post<ComponenteView[]>(`/assets/${ativo.id}/components`, {
      kind: 'BATERIA',
      name: 'Bateria velha',
      attributes: { capacidade: 41000 },
    });
    const peca = criados.corpo[0];

    const r = await supervisor.del<ComponenteView[]>(
      `/assets/${ativo.id}/components/${peca.id}`,
    );
    assert.equal(r.status, 200);
    assert.ok(!r.corpo.some((c) => c.id === peca.id));
  });

  it('a peça de um ativo não se edita pela rota de outro', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const um = await criarAtivo(supervisor, 'Estação A');
    const outro = await criarAtivo(supervisor, 'Estação B');

    const criados = await supervisor.post<ComponenteView[]>(`/assets/${um.id}/components`, {
      kind: 'FONTE',
      name: 'Fonte da A',
      attributes: { potencia: 400 },
    });
    const peca = criados.corpo[0];

    const r = await supervisor.patch<ProblemDetails>(
      `/assets/${outro.id}/components/${peca.id}`,
      { name: 'Roubada' },
    );
    assert.equal(r.status, 404);
  });
});

describe('fabricante e permissão', () => {
  it('a peça referencia o catálogo de fabricantes', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação com fabricante');

    const fabricantes = await supervisor.post<FabricanteView[]>('/manufacturers', {
      name: 'Kingston',
    });
    const kingston = fabricantes.corpo.find((x) => x.name === 'Kingston');
    assert.ok(kingston);

    const r = await supervisor.post<ComponenteView[]>(`/assets/${ativo.id}/components`, {
      kind: 'MEMORIA',
      name: 'KVR26N19S8',
      manufacturerId: kingston.id,
      attributes: { capacidade: 8192 },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo[0].manufacturer?.name, 'Kingston');
  });

  it('recusa fabricante de outra organização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação com fabricante de fora');

    const alheio = await prisma.manufacturer.create({
      data: { organizationId: f.outra.id, name: 'Fabricante Alheio' },
    });

    const r = await supervisor.post<ProblemDetails>(`/assets/${ativo.id}/components`, {
      kind: 'MEMORIA',
      name: 'De fora',
      manufacturerId: alheio.id,
      attributes: { capacidade: 8192 },
    });
    assert.equal(r.status, 400);
  });

  it('o agente lê os componentes, o solicitante não escreve', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const ativo = await criarAtivo(supervisor, 'Estação de permissão');

    const agente = await entrar('agente@teste.dev');
    assert.equal((await agente.get(`/assets/${ativo.id}/components`)).status, 200);

    const solicitante = await entrar('solicitante@teste.dev');
    const r = await solicitante.post(`/assets/${ativo.id}/components`, {
      kind: 'FONTE',
      name: 'Tentativa',
    });
    assert.equal(r.status, 403);
  });
});
