/**
 * Financeiro: baixa idempotente, webhook assinado e idempotente, caução
 * fora da receita, falha de pagamento sem efeito no contrato, mensalidades
 * sem duplicidade e aprovação de despesas.
 * Cenários 5, 6, 7, 8, 15 e 17 das regras obrigatórias.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Client, inDays, startApi, stopApi } from './helpers';
import { asPlatform, createOrg, type TestOrg } from './db';
import { completedInspection, createCustomer, createVehicle, key, setupRates } from './rentals.fixtures';

let A: TestOrg;
let owner: Client;
let base: string;

before(async () => {
  base = await startApi();
  A = await createOrg();
  await setupRates(A);
  owner = new Client();
  await owner.login(A.users.owner!);
});
after(stopApi);

/** Contrato de longo prazo entregue, com caução recebido. */
async function activeLongTerm() {
  const v = await createVehicle(A);
  const { customer, driver } = await createCustomer(A);
  const created = await owner.post('/contracts', {
    kind: 'LONG_TERM', branchId: A.branchId, customerId: customer.id, driverId: driver.id, vehicleUnitId: v.id,
    startAt: new Date(Date.now() + 3_600_000).toISOString(), termMonths: 12, billingDay: 10,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.id;
  assert.equal((await owner.post(`/contracts/${id}/approve`)).status, 200);
  const detail = await owner.get(`/contracts/${id}`);
  await owner.post(`/deposits/${detail.data.deposit.id}/receipts`, { amount: 500, method: 'PIX', idempotencyKey: key() });
  await completedInspection(A, { contractId: id, vehicleUnitId: v.id, type: 'DELIVERY', odometerKm: 1000 });
  const act = await owner.post(`/contracts/${id}/activate`, {});
  assert.equal(act.status, 200, JSON.stringify(act.data));
  return { id, depositId: detail.data.deposit.id as string, customerId: customer.id };
}

async function receivableOf(contractId: string) {
  const list = await owner.get(`/receivables?contractId=${contractId}&open=true`);
  assert.ok(list.data.items.length > 0, 'deveria haver mensalidade em aberto');
  return list.data.items[0];
}

describe('Baixa de títulos', () => {
  test('a mesma chave de idempotência, repetida e simultânea, gera um único pagamento', async () => {
    const { id } = await activeLongTerm();
    const r = await receivableOf(id);
    const idempotencyKey = key();
    const body = { amount: 100, method: 'PIX', idempotencyKey };
    const [a, b] = await Promise.all([owner.post(`/receivables/${r.id}/payments`, body), owner.post(`/receivables/${r.id}/payments`, body)]);
    assert.equal(a.status, 201, JSON.stringify(a.data));
    assert.equal(b.status, 201, JSON.stringify(b.data));
    assert.equal(a.data.id, b.data.id);
    const again = await owner.post(`/receivables/${r.id}/payments`, body);
    assert.equal(again.data.id, a.data.id);
    const count = await asPlatform((tx) => tx.payment.count({ where: { receivableId: r.id } }));
    assert.equal(count, 1);
    const after = await owner.get(`/receivables/${r.id}`);
    assert.equal(Number(after.data.paidAmount), 100);
    assert.equal(after.data.status, 'PARTIAL');
  });

  test('valor acima do saldo é recusado; estorno reabre o saldo', async () => {
    const { id } = await activeLongTerm();
    const r = await receivableOf(id);
    assert.equal((await owner.post(`/receivables/${r.id}/payments`, { amount: 999_999, method: 'PIX', idempotencyKey: key() })).status, 400);
    const paid = await owner.post(`/receivables/${r.id}/payments`, { amount: Number(r.amount), method: 'TRANSFER', idempotencyKey: key() });
    assert.equal((await owner.get(`/receivables/${r.id}`)).data.status, 'PAID');
    const rev = await owner.post(`/payments/${paid.data.id}/reverse`, { reason: 'Transferência devolvida pelo banco' });
    assert.equal(rev.status, 200);
    const after = await owner.get(`/receivables/${r.id}`);
    assert.equal(after.data.status, 'OPEN');
    assert.equal(Number(after.data.paidAmount), 0);
  });

  test('perfil sem finance.settle não dá baixa', async () => {
    const { id } = await activeLongTerm();
    const r = await receivableOf(id);
    const agent = new Client();
    await agent.login(A.users.rental_agent!);
    assert.equal((await agent.post(`/receivables/${r.id}/payments`, { amount: 10, method: 'CASH', idempotencyKey: key() })).status, 403);
  });
});

describe('Webhook do provedor de pagamento', () => {
  const secret = 'segredo-de-teste-do-provedor';
  before(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CryptoService } = require('../dist/common/crypto.service');
    await asPlatform((tx) => tx.integrationConfig.create({
      data: { organizationId: A.id, provider: 'payment:generic', status: 'CONFIGURED', secretEnc: new CryptoService().encrypt(secret) },
    }));
  });

  const send = (payload: object, signWith = secret) => {
    const raw = JSON.stringify(payload);
    return fetch(`${base}/webhooks/payments/generic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nortycar-signature': `sha256=${createHmac('sha256', signWith).update(raw).digest('hex')}` },
      body: raw,
    }).then(async (res) => ({ status: res.status, data: (await res.json().catch(() => null)) as any }));
  };

  test('assinatura inválida é recusada e nada é gravado', async () => {
    const { id } = await activeLongTerm();
    const r = await receivableOf(id);
    const eventId = `evt-${randomUUID()}`;
    const res = await send({ eventId, type: 'payment.confirmed', organizationId: A.id, receivableId: r.id, amount: 50 }, 'outro-segredo');
    assert.equal(res.status, 401);
    assert.equal(await asPlatform((tx) => tx.inboundWebhookEvent.count({ where: { eventId } })), 0);
  });

  test('o mesmo evento entregue duas vezes gera um único pagamento', async () => {
    const { id } = await activeLongTerm();
    const r = await receivableOf(id);
    const event = { eventId: `evt-${randomUUID()}`, type: 'payment.confirmed', organizationId: A.id, receivableId: r.id, amount: 80, method: 'PIX' };
    const first = await send(event);
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const second = await send(event);
    assert.equal(second.status, 200);
    assert.equal(second.data.duplicate, true);
    const payments = await asPlatform((tx) => tx.payment.findMany({ where: { receivableId: r.id } }));
    assert.equal(payments.length, 1);
    assert.equal(payments[0].providerEventId, event.eventId);
  });

  test('pagamento recusado não altera o contrato', async () => {
    const { id } = await activeLongTerm();
    const r = await receivableOf(id);
    const res = await send({ eventId: `evt-${randomUUID()}`, type: 'payment.failed', organizationId: A.id, receivableId: r.id, reason: 'Saldo insuficiente' });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const contract = await owner.get(`/contracts/${id}`);
    assert.equal(contract.data.status, 'ACTIVE');
    assert.equal((await owner.get(`/receivables/${r.id}`)).data.status, 'OPEN');
  });

  test('empresa sem provedor configurado recebe 503', async () => {
    const other = await createOrg();
    const res = await send({ eventId: `evt-${randomUUID()}`, type: 'payment.confirmed', organizationId: other.id, receivableId: randomUUID(), amount: 1 });
    assert.equal(res.status, 503);
  });
});

describe('Caução e receita', () => {
  test('recebimento de caução não entra na receita; utilização exige aprovação', async () => {
    const before = (await owner.get('/finance/summary')).data;
    const { id, depositId } = await activeLongTerm();
    const after = (await owner.get('/finance/summary')).data;
    assert.equal(after.revenue.received, before.revenue.received, 'caução não pode aparecer como receita');
    assert.ok(after.deposits.held >= before.deposits.held + 500);

    const r = await receivableOf(id);
    const agent = new Client();
    await agent.login(A.users.rental_agent!);
    const request = await agent.post(`/deposits/${depositId}/deductions`, { amount: 200, reason: 'Mensalidade em atraso', receivableId: r.id, idempotencyKey: key() });
    assert.equal(request.status, 201, JSON.stringify(request.data));
    assert.equal(request.data.status, 'PENDING_APPROVAL');
    // Pedido não aprovado não compensa nada.
    assert.equal(Number((await owner.get(`/receivables/${r.id}`)).data.paidAmount), 0);
    assert.equal((await agent.post(`/deposits/entries/${request.data.id}/approve`)).status, 403);
    const ok = await owner.post(`/deposits/entries/${request.data.id}/approve`);
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const title = await owner.get(`/receivables/${r.id}`);
    assert.equal(Number(title.data.paidAmount), 200);
    assert.equal(title.data.payments[0].method, 'DEPOSIT_OFFSET');
    const dep = await owner.get(`/deposits/${depositId}`);
    assert.equal(dep.data.balance.available, 300);
    assert.equal(dep.data.status, 'PARTIALLY_USED');
  });

  test('utilização acima do saldo é recusada', async () => {
    const { depositId } = await activeLongTerm();
    const res = await owner.post(`/deposits/${depositId}/deductions`, { amount: 600, reason: 'Avaria', idempotencyKey: key() });
    assert.equal(res.status, 400);
  });
});

describe('Mensalidades e despesas', () => {
  test('gerar mensalidades várias vezes não duplica competências', async () => {
    const { id } = await activeLongTerm();
    const first = await owner.post('/contracts/billing/generate', { horizonDays: 120 });
    const second = await owner.post('/contracts/billing/generate', { horizonDays: 120 });
    assert.equal(first.status, 200);
    assert.equal(second.data.created, 0);
    const rows = await asPlatform((tx) => tx.receivable.findMany({ where: { contractId: id, kind: 'MONTHLY' } }));
    assert.equal(new Set(rows.map((r: any) => r.competence)).size, rows.length);
    assert.ok(rows.length >= 3);
  });

  test('conta a pagar só é paga depois de aprovada, dentro da alçada', async () => {
    await asPlatform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { email: A.users.finance } });
      await tx.membership.updateMany({ where: { organizationId: A.id, userId: user.id }, data: { approvalLimit: 1000 } });
    });
    const fin = new Client();
    await fin.login(A.users.finance!);
    const p = await fin.post('/payables', { branchId: A.branchId, kind: 'MAINTENANCE', description: 'Troca de pastilhas', amount: 1500, dueDate: inDays(5).toISOString().slice(0, 10) });
    assert.equal(p.status, 201, JSON.stringify(p.data));
    assert.equal((await fin.post(`/payables/${p.data.id}/payments`, { amount: 1500, method: 'PIX', idempotencyKey: key() })).status, 409);
    assert.equal((await fin.post(`/payables/${p.data.id}/approve`)).status, 403);
    assert.equal((await owner.post(`/payables/${p.data.id}/approve`)).status, 200);
    const paid = await fin.post(`/payables/${p.data.id}/payments`, { amount: 1500, method: 'PIX', idempotencyKey: key() });
    assert.equal(paid.status, 201);
    assert.equal((await fin.get(`/payables/${p.data.id}`)).data.status, 'PAID');
  });

  test('resumo e fluxo de caixa respondem com previsto e realizado', async () => {
    const summary = await owner.get('/finance/summary');
    assert.equal(summary.status, 200);
    assert.ok('expected' in summary.data.revenue && 'reconciled' in summary.data.revenue);
    const flow = await owner.get('/finance/cashflow?groupBy=month');
    assert.equal(flow.status, 200);
    assert.ok(Array.isArray(flow.data.series));
  });

  test('fornecedor com CNPJ inválido é recusado; leitura é aberta à equipe', async () => {
    assert.equal((await owner.post('/suppliers', { name: 'Oficina X', document: '11.222.333/0001-80' })).status, 400);
    const ok = await owner.post('/suppliers', { name: 'Oficina Teste', document: '11.222.333/0001-81', kinds: ['WORKSHOP'] });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    const viewer = new Client();
    await viewer.login(A.users.viewer!);
    assert.equal((await viewer.get('/suppliers?kind=WORKSHOP')).status, 200);
    assert.equal((await viewer.post('/suppliers', { name: 'Outra' })).status, 403);
  });
});
