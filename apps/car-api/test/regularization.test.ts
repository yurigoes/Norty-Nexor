/**
 * Regularização e venda de frota: infrações (cenário 9), sinistros e
 * venda (cenário 14).
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client, startApi, stopApi, unique } from './helpers';
import { asPlatform, createOrg, db, type TestOrg } from './db';
import { createActiveContract, createCustomerAndDriver, createVehicle } from './fixtures-insights';

let A: TestOrg;
const owner = new Client('owner');
const finance = new Client('finance');

before(async () => {
  await startApi();
  A = await createOrg();
  await owner.login(A.users.owner!);
  await finance.login(A.users.finance!);
});
after(stopApi);

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

async function newInfraction(vehicleUnitId: string, occurredAt = day(-2)) {
  const res = await owner.post('/infractions', {
    autoNumber: unique('AI'), authority: 'DETRAN-MG', description: 'Avançar sinal vermelho', occurredAt: occurredAt.toISOString(),
    vehicleUnitId, originalAmount: 293.47, discountAmount: 58.69, dueDate: day(20).toISOString().slice(0, 10),
    driverIndicationDeadline: day(10).toISOString().slice(0, 10),
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data;
}

describe('Infrações', () => {
  test('valor final = original − desconto + juros, em centavos', async () => {
    const v = await createVehicle(A.id, A.branchId);
    const inf = await newInfraction(v.id);
    assert.equal(Number(inf.finalAmount), 234.78);
  });

  test('mudança de status gera histórico (InfractionEvent) e transição inválida é recusada', async () => {
    const v = await createVehicle(A.id, A.branchId);
    const inf = await newInfraction(v.id);
    const ok = await owner.post(`/infractions/${inf.id}/status`, { adminStatus: 'UNDER_REVIEW', note: 'Conferindo notificação' });
    assert.equal(ok.status, 200);
    const events = await asPlatform((tx) => tx.infractionEvent.findMany({ where: { infractionId: inf.id, field: 'adminStatus' } }));
    assert.equal(events.length, 1);
    assert.equal(events[0].fromValue, 'RECEIVED');
    assert.equal(events[0].toValue, 'UNDER_REVIEW');
    const bad = await owner.post(`/infractions/${inf.id}/status`, { adminStatus: 'GRANTED', note: 'Pulando etapas' });
    assert.equal(bad.status, 409);
    const forged = await owner.post(`/infractions/${inf.id}/status`, { adminStatus: 'DRIVER_INDICATED', note: 'Atalho' });
    assert.equal(forged.status, 400);
    const edit = await owner.patch(`/infractions/${inf.id}`, { originalAmount: 300, note: 'Valor corrigido' });
    assert.equal(edit.status, 200);
    const amountEvents = await asPlatform((tx) => tx.infractionEvent.findMany({ where: { infractionId: inf.id, field: 'originalAmount' } }));
    assert.equal(amountEvents.length, 1);
  });

  test('sugestão aponta o motorista do contrato vigente na data; indicar exige permissão própria', async () => {
    const v = await createVehicle(A.id, A.branchId);
    const { customer, driver } = await createCustomerAndDriver(A.id);
    const contract = await createActiveContract(A.id, A.branchId, v.id, customer.id, driver.id, day(-10), day(10));
    const inf = await newInfraction(v.id, day(-3));
    const suggestion = await owner.get(`/infractions/${inf.id}/driver-suggestion`);
    assert.equal(suggestion.status, 200);
    assert.equal(suggestion.data.found, true);
    assert.equal(suggestion.data.driver.id, driver.id);
    assert.equal(suggestion.data.contract.id, contract.id);
    // A sugestão não indica nada sozinha.
    const still = await owner.get(`/infractions/${inf.id}`);
    assert.equal(still.data.driverId, null);

    // Financeiro gerencia infrações, mas não tem infractions.indicate_driver.
    const denied = await finance.post(`/infractions/${inf.id}/indicate-driver`, { driverId: driver.id, contractId: contract.id });
    assert.equal(denied.status, 403);
    const ok = await owner.post(`/infractions/${inf.id}/indicate-driver`, { driverId: driver.id, contractId: contract.id });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.adminStatus, 'DRIVER_INDICATED');
    assert.equal(ok.data.customerId, customer.id);
  });

  test('infração antes de qualquer contrato não sugere ninguém', async () => {
    const v = await createVehicle(A.id, A.branchId);
    const inf = await newInfraction(v.id);
    const suggestion = await owner.get(`/infractions/${inf.id}/driver-suggestion`);
    assert.equal(suggestion.data.found, false);
  });

  test('pagar pela locadora gera conta a pagar FINE pendente de aprovação; cobrar gera reembolso', async () => {
    const v = await createVehicle(A.id, A.branchId);
    const { customer } = await createCustomerAndDriver(A.id);
    const inf = await newInfraction(v.id);
    const paid = await owner.post(`/infractions/${inf.id}/pay`, { dueDate: day(5).toISOString().slice(0, 10) });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.financialStatus, 'PAID_BY_COMPANY');
    const payable = await asPlatform((tx) => tx.payable.findUnique({ where: { id: paid.data.payableId } }));
    assert.equal(payable.kind, 'FINE');
    assert.equal(payable.approval, 'PENDING_APPROVAL');
    const charged = await owner.post(`/infractions/${inf.id}/charge`, { customerId: customer.id, dueDate: day(15).toISOString().slice(0, 10) });
    assert.equal(charged.status, 200);
    assert.equal(charged.data.financialStatus, 'AWAITING_REIMBURSEMENT');
    const receivable = await asPlatform((tx) => tx.receivable.findUnique({ where: { id: charged.data.receivableId } }));
    assert.equal(receivable.kind, 'INFRACTION_REIMBURSEMENT');
    const again = await owner.post(`/infractions/${inf.id}/pay`, { dueDate: day(5).toISOString().slice(0, 10) });
    assert.equal(again.status, 409);
  });

  test('outra empresa não enxerga a infração', async () => {
    const B = await createOrg();
    const other = new Client();
    await other.login(B.users.owner!);
    const v = await createVehicle(A.id, A.branchId);
    const inf = await newInfraction(v.id);
    assert.equal((await other.get(`/infractions/${inf.id}`)).status, 404);
  });
});

describe('Sinistros', () => {
  test('sinistro com bloqueio deixa o veículo BLOCKED e registra histórico', async () => {
    const v = await createVehicle(A.id, A.branchId);
    const res = await owner.post('/claims', { vehicleUnitId: v.id, type: 'COLLISION', occurredAt: day(-1).toISOString(), description: 'Colisão traseira no estacionamento', blocksVehicle: true });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.match(res.data.number, /^SIN-\d{6}$/);
    const vehicle = await asPlatform((tx) => tx.vehicleUnit.findUnique({ where: { id: v.id } }));
    assert.equal(vehicle.operationalStatus, 'BLOCKED');
    const status = await owner.post(`/claims/${res.data.id}/status`, { status: 'INSURER_NOTIFIED', note: 'Aviso à seguradora' });
    assert.equal(status.status, 200);
    const events = await asPlatform((tx) => tx.claimEvent.findMany({ where: { claimId: res.data.id } }));
    assert.equal(events.length, 2);
    const expense = await owner.post(`/claims/${res.data.id}/expenses`, { kind: 'MAINTENANCE', description: 'Funilaria', amount: 1800, dueDate: day(10).toISOString().slice(0, 10) });
    assert.equal(expense.status, 201);
    assert.equal(expense.data.claimId, res.data.id);
  });
});

describe('Venda de frota', () => {
  test('venda recusada com contrato ativo; efetiva sem; vendido sai da disponibilidade', async () => {
    const { AvailabilityService } = require(resolve(__dirname, '../dist/common/availability.service'));
    const availability = new AvailabilityService();

    const busy = await createVehicle(A.id, A.branchId);
    const { customer, driver } = await createCustomerAndDriver(A.id);
    await createActiveContract(A.id, A.branchId, busy.id, customer.id, driver.id, day(-5), day(5));
    const listed = await owner.post('/sales', { vehicleUnitId: busy.id, askingPrice: 70000 });
    assert.equal(listed.status, 201);
    const refused = await owner.post(`/sales/${listed.data.id}/close`, { buyerName: 'Comprador Teste', salePrice: 69000, dueDate: day(3).toISOString().slice(0, 10) });
    assert.equal(refused.status, 409);
    assert.match(refused.data.message, /contrato/);

    const free = await createVehicle(A.id, A.branchId, { acquisitionValue: 80000, acquiredAt: day(-365) });
    const sale = await owner.post('/sales', { vehicleUnitId: free.id, askingPrice: 72000, minimumPrice: 68000 });
    // À venda já sai da oferta de locação.
    const forSale = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${A.id}, true)`;
      return availability.findAvailable(tx, A.id, { startAt: day(1), endAt: day(3) });
    });
    assert.ok(!forSale.some((u: { id: string }) => u.id === free.id));

    const closed = await owner.post(`/sales/${sale.data.id}/close`, { buyerName: 'Comprador Teste', salePrice: 70000, dueDate: day(3).toISOString().slice(0, 10) });
    assert.equal(closed.status, 200, JSON.stringify(closed.data));
    assert.equal(closed.data.status, 'SOLD');
    const vehicle = await asPlatform((tx) => tx.vehicleUnit.findUnique({ where: { id: free.id } }));
    assert.equal(vehicle.commercialStatus, 'SOLD');
    const receivable = await asPlatform((tx) => tx.receivable.findUnique({ where: { id: closed.data.receivableId } }));
    assert.equal(receivable.kind, 'VEHICLE_SALE');
    // Histórico preservado: SALE e DISPOSAL na linha do tempo.
    const events = await asPlatform((tx) => tx.vehicleTimelineEvent.findMany({ where: { vehicleUnitId: free.id } }));
    assert.ok(events.some((e: { type: string }) => e.type === 'DISPOSAL'));

    // Vendido não reserva: a alocação é recusada.
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${A.id}, true)`;
      await availability.allocate(tx, A.id, { vehicleUnitId: free.id, kind: 'RESERVATION', startsAt: day(10), endsAt: day(12) });
    }), /vendido/i);
  });

  test('fechar venda exige sales.close', async () => {
    const v = await createVehicle(A.id, A.branchId);
    const sale = await owner.post('/sales', { vehicleUnitId: v.id, askingPrice: 50000 });
    const res = await finance.post(`/sales/${sale.data.id}/close`, { buyerName: 'X', salePrice: 50000, dueDate: day(3).toISOString().slice(0, 10) });
    assert.equal(res.status, 403);
  });
});
