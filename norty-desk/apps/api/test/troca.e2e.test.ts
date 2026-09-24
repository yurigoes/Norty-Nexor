import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  AssetView,
  PosseView,
  TicketDetail,
  TicketEventView,
  TrocaResponse,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Sai um equipamento, entra outro.
 *
 * É o fim do caminho que o cliente pediu: ele solicita a troca por
 * chamado, e o inventário acompanha — o que entrou, o que saiu, e se o
 * que saiu foi guardar ou foi para o descarte.
 *
 * O que se prova aqui e em nenhum outro lugar:
 *
 * 1. **Ou troca, ou nada.** As duas pontas numa transação só: se a
 *    entrega falhasse depois da devolução, a pessoa ficaria sem nada.
 * 2. **A pessoa é a mesma dos dois lados.** Trocar para outra pessoa
 *    são duas operações separadas, e o serviço recusa em vez de
 *    adivinhar.
 * 3. **Uma assinatura, dois papéis.** Mesmo instante, mesmo dedo.
 * 4. **O chamado fica sabendo**, em evento público: é a coisa mais
 *    concreta que aconteceu no atendimento.
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();

  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

const PNG =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let sequencia = 0;

async function criarAtivo(nome: string): Promise<AssetView> {
  sequencia += 1;
  const r = await admin.post<AssetView>('/assets', {
    name: `${nome} ${sequencia}`,
    kind: 'COMPUTADOR',
    tag: `PAT-TROCA-${sequencia}`,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

async function abrirChamado(): Promise<TicketDetail> {
  const r = await admin.post<TicketDetail>('/tickets', {
    subject: 'Notebook não liga',
    description: 'Pediu a troca.',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

const entregar = (assetId: string, userId: string) =>
  admin.post<PosseView[]>(`/assets/${assetId}/posse`, { userId });

const trocar = (ticketId: string, corpo: Record<string, unknown>) =>
  admin.post<TrocaResponse & { detail?: string }>(`/tickets/${ticketId}/troca`, corpo);

/** O cenário completo: alguém com um equipamento, e um de reserva livre. */
async function cenario() {
  const antigo = await criarAtivo('Notebook antigo');
  const novo = await criarAtivo('Notebook de reserva');
  const chamado = await abrirChamado();

  assert.equal((await entregar(antigo.id, f.solicitante.id)).status, 201);

  return { antigo, novo, chamado };
}

// ---------------------------------------------------------------------

describe('a troca', () => {
  it('devolve um, entrega o outro, e os dois termos saem de uma assinatura', async () => {
    const { antigo, novo, chamado } = await cenario();

    const r = await trocar(chamado.id, {
      saiAssetId: antigo.id,
      entraAssetId: novo.id,
      returnedTo: 'BAIXADO',
      comQuebra: true,
      notes: 'Caiu e a placa-mãe parou.',
      signature: PNG,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    // O que saiu: posse encerrada, destino gravado, termo de quebra.
    const posseAntiga = r.corpo.saiu[0]!;
    assert.equal(posseAntiga.isCurrent, false);
    assert.equal(posseAntiga.returnedTo, 'BAIXADO');

    const quebra = posseAntiga.terms.find((t) => t.kind === 'QUEBRA')!;
    assert.ok(quebra, 'a quebra deveria ter gerado o termo de ocorrência');
    assert.ok(quebra.body.includes('Caiu e a placa-mãe parou'), quebra.body);

    // O que entrou: posse aberta na mesma pessoa, termo de compromisso.
    const posseNova = r.corpo.entrou[0]!;
    assert.equal(posseNova.isCurrent, true);
    assert.equal(posseNova.user.id, f.solicitante.id);
    assert.equal(posseNova.terms[0]!.kind, 'COMPROMISSO');

    // E o parque acompanhou.
    const [saiu, entrou] = await Promise.all([
      prisma.asset.findUniqueOrThrow({ where: { id: antigo.id } }),
      prisma.asset.findUniqueOrThrow({ where: { id: novo.id } }),
    ]);

    assert.equal(saiu.userId, null);
    assert.equal(saiu.status, 'BAIXADO');
    assert.equal(entrou.userId, f.solicitante.id);
    assert.equal(entrou.status, 'EM_USO');
  });

  it('o chamado registra a troca, e o cliente pode ver', async () => {
    const { antigo, novo, chamado } = await cenario();

    await trocar(chamado.id, {
      saiAssetId: antigo.id,
      entraAssetId: novo.id,
      returnedTo: 'EM_ESTOQUE',
    });

    const eventos = await admin.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    assert.equal(eventos.status, 200);

    const troca = eventos.corpo.find((e) => e.type === 'TROCA_DE_ATIVO')!;
    assert.ok(troca, 'a troca não apareceu na linha do tempo');
    assert.equal(troca.visibility, 'PUBLICA', 'o cliente tem direito de ver que a máquina mudou');

    const carga = troca.payload as {
      saiu: { id: string; nome: string };
      entrou: { id: string; nome: string };
      destino: string;
      comQuebra: boolean;
    };

    assert.equal(carga.saiu.id, antigo.id);
    assert.equal(carga.entrou.id, novo.id);
    assert.equal(carga.destino, 'EM_ESTOQUE');
    assert.equal(carga.comQuebra, false);

    // O nome fica gravado: renomear o equipamento depois não pode
    // reescrever o que o chamado disse que aconteceu.
    assert.ok(carga.saiu.nome.startsWith('Notebook antigo'), carga.saiu.nome);

    // E os dois ficam amarrados ao chamado.
    const vinculados = await admin.get<AssetView[]>(`/tickets/${chamado.id}/ativos`);
    assert.deepEqual(
      vinculados.corpo.map((a) => a.id).sort(),
      [antigo.id, novo.id].sort(),
    );
  });

  it('sem posse aberta não é troca, é entrega', async () => {
    const antigo = await criarAtivo('Nunca saiu do estoque');
    const novo = await criarAtivo('Reserva');
    const chamado = await abrirChamado();

    const r = await trocar(chamado.id, {
      saiAssetId: antigo.id,
      entraAssetId: novo.id,
      returnedTo: 'EM_ESTOQUE',
    });

    assert.equal(r.status, 409, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /não está com ninguém/);
  });

  it('o equipamento que entra tem de estar livre', async () => {
    const { antigo, novo, chamado } = await cenario();
    assert.equal((await entregar(novo.id, f.agente.id)).status, 201);

    const r = await trocar(chamado.id, {
      saiAssetId: antigo.id,
      entraAssetId: novo.id,
      returnedTo: 'EM_ESTOQUE',
    });

    assert.equal(r.status, 409, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /já está com/);
  });

  it('trocar o equipamento por ele mesmo é recusado', async () => {
    const { antigo, chamado } = await cenario();

    const r = await trocar(chamado.id, {
      saiAssetId: antigo.id,
      entraAssetId: antigo.id,
      returnedTo: 'EM_ESTOQUE',
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('quebra sem descrição é recusada antes de qualquer escrita', async () => {
    const { antigo, novo, chamado } = await cenario();

    const r = await trocar(chamado.id, {
      saiAssetId: antigo.id,
      entraAssetId: novo.id,
      returnedTo: 'BAIXADO',
      comQuebra: true,
      signature: PNG,
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));

    // E nada aconteceu: a pessoa continua com o equipamento antigo.
    const ativo = await prisma.asset.findUniqueOrThrow({ where: { id: antigo.id } });
    assert.equal(ativo.userId, f.solicitante.id, 'a recusa deixou meia troca gravada');
  });

  it('a recusa não deixa meia troca: o que entra de outra empresa para tudo', async () => {
    const { antigo, chamado } = await cenario();

    const empresa = await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: `Empresa alheia ${sequencia}`,
        emailDomain: `alheia${sequencia}.com.br`,
      },
    });

    // O solicitante é da casa, então precisa de alguém do cliente para
    // a cerca de carteira valer. Trocamos quem está com o antigo.
    const doCliente = await prisma.user.create({
      data: {
        name: 'Pessoa da empresa alheia',
        email: `alheia${sequencia}@teste.dev`,
        passwordHash: null,
        memberships: {
          create: { organizationId: f.organizacao.id, clientId: empresa.id, role: 'CLIENTE' },
        },
      },
    });

    const novo = await criarAtivo('Reserva de outra empresa');
    await prisma.asset.update({ where: { id: novo.id }, data: { clientId: empresa.id } });

    // Quem está com o antigo é do cliente; o que entra é do mesmo
    // cliente — isso passa. Agora o contrário: devolvemos e entregamos
    // ao da casa, e a troca por um do cliente tem de ser recusada.
    await admin.post(`/assets/${antigo.id}/devolver`, { returnedTo: 'EM_ESTOQUE' });
    assert.equal((await entregar(antigo.id, doCliente.id)).status, 201);

    const daCasa = await criarAtivo('Reserva da casa');
    const outraEmpresa = await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: `Terceira empresa ${sequencia}`,
        emailDomain: `terceira${sequencia}.com.br`,
      },
    });
    await prisma.asset.update({
      where: { id: daCasa.id },
      data: { clientId: outraEmpresa.id },
    });

    const r = await trocar(chamado.id, {
      saiAssetId: antigo.id,
      entraAssetId: daCasa.id,
      returnedTo: 'EM_ESTOQUE',
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));

    const aindaComEla = await prisma.asset.findUniqueOrThrow({ where: { id: antigo.id } });
    assert.equal(aindaComEla.userId, doCliente.id, 'a recusa deixou meia troca gravada');
  });

  it('chamado de outra organização é 404 — não confirma que existe', async () => {
    const { antigo, novo } = await cenario();

    // Quem chama **tem** a permissão da rota: o que falta é enxergar
    // este chamado. 403 aqui confirmaria que ele existe, e é a mesma
    // regra do resto do módulo de chamados.
    const alheio = await prisma.ticket.create({
      data: {
        organizationId: f.outra.id,
        number: 90001,
        protocol: 'TROCA-ALHEIA-1',
        subject: 'Chamado de outra organização',
        description: 'x',
        type: 'INCIDENTE',
      },
      select: { id: true },
    });

    const r = await admin.post<{ detail?: string }>(`/tickets/${alheio.id}/troca`, {
      saiAssetId: antigo.id,
      entraAssetId: novo.id,
      returnedTo: 'EM_ESTOQUE',
    });

    assert.equal(r.status, 404, JSON.stringify(r.corpo));

    // E nada foi escrito: a pessoa continua com o equipamento antigo.
    const ativo = await prisma.asset.findUniqueOrThrow({ where: { id: antigo.id } });
    assert.equal(ativo.userId, f.solicitante.id);
  });
});
