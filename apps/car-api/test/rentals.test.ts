/**
 * Reservas e contratos: agenda sem dupla reserva, retirada, entrega com
 * vistoria, trocas com histórico, encerramento, alçada e isolamento.
 * Cenários 1, 2, 3, 4, 11, 13 e 14 das regras obrigatórias.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, inDays, startApi, stopApi } from './helpers';
import { asPlatform, createOrg, type TestOrg } from './db';
import { completedInspection, createCustomer, createVehicle, key, setupRates } from './rentals.fixtures';

let A: TestOrg;
let B: TestOrg;
let owner: Client;
let categoryId: string;

before(async () => {
  await startApi();
  A = await createOrg();
  B = await createOrg();
  categoryId = await setupRates(A);
  await setupRates(B);
  owner = new Client('dono A');
  await owner.login(A.users.owner!);
});
after(stopApi);

async function request(client: Client, org: TestOrg, customerId: string, driverId: string, start: Date, end: Date) {
  const res = await client.post('/reservations', { customerId, driverId, categoryId, branchId: org.branchId, startAt: start.toISOString(), endAt: end.toISOString() });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data;
}

describe('Agenda e reservas', () => {
  test('duas confirmações simultâneas do mesmo carro: uma passa, a outra recebe 409', async () => {
    const v = await createVehicle(A);
    const { customer, driver } = await createCustomer(A);
    const r1 = await request(owner, A, customer.id, driver.id, inDays(10), inDays(13));
    const r2 = await request(owner, A, customer.id, driver.id, inDays(11), inDays(14));
    const other = new Client();
    await other.login(A.users.admin!);
    const [a, b] = await Promise.all([
      owner.post(`/reservations/${r1.id}/confirm`, { vehicleUnitId: v.id }),
      other.post(`/reservations/${r2.id}/confirm`, { vehicleUnitId: v.id }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409], JSON.stringify([a.data, b.data]));
    const allocations = await asPlatform((tx) => tx.vehicleAllocation.count({ where: { vehicleUnitId: v.id, active: true } }));
    assert.equal(allocations, 1);
  });

  test('tempo de preparo após a devolução é respeitado', async () => {
    const v = await createVehicle(A);
    const { customer, driver } = await createCustomer(A);
    const end = inDays(22);
    const r1 = await request(owner, A, customer.id, driver.id, inDays(20), end);
    assert.equal((await owner.post(`/reservations/${r1.id}/confirm`, { vehicleUnitId: v.id })).status, 200);
    // Preparo padrão: 2 h. Retirar 1 h depois da devolução colide.
    const tooSoon = await request(owner, A, customer.id, driver.id, new Date(end.getTime() + 3_600_000), inDays(24));
    assert.equal((await owner.post(`/reservations/${tooSoon.id}/confirm`, { vehicleUnitId: v.id })).status, 409);
    const fine = await request(owner, A, customer.id, driver.id, new Date(end.getTime() + 3 * 3_600_000), inDays(24));
    assert.equal((await owner.post(`/reservations/${fine.id}/confirm`, { vehicleUnitId: v.id })).status, 200);
  });

  test('veículo bloqueado ou vendido não recebe reserva', async () => {
    const blocked = await createVehicle(A, { operationalStatus: 'BLOCKED' });
    const sold = await createVehicle(A, { commercialStatus: 'SOLD' });
    const { customer, driver } = await createCustomer(A);
    const r = await request(owner, A, customer.id, driver.id, inDays(30), inDays(32));
    assert.equal((await owner.post(`/reservations/${r.id}/confirm`, { vehicleUnitId: blocked.id })).status, 409);
    assert.equal((await owner.post(`/reservations/${r.id}/confirm`, { vehicleUnitId: sold.id })).status, 409);
  });

  test('cliente bloqueado não reserva; cancelamento libera a agenda', async () => {
    const v = await createVehicle(A);
    const { customer: blockedCustomer, driver: d1 } = await createCustomer(A, { status: 'BLOCKED' });
    const res = await owner.post('/reservations', { customerId: blockedCustomer.id, driverId: d1.id, categoryId, branchId: A.branchId, startAt: inDays(40).toISOString(), endAt: inDays(41).toISOString() });
    assert.equal(res.status, 409);
    const { customer, driver } = await createCustomer(A);
    const r = await request(owner, A, customer.id, driver.id, inDays(40), inDays(41));
    await owner.post(`/reservations/${r.id}/confirm`, { vehicleUnitId: v.id });
    const cancel = await owner.post(`/reservations/${r.id}/cancel`, { reason: 'Cliente desistiu' });
    assert.equal(cancel.status, 200);
    assert.equal(await asPlatform((tx) => tx.vehicleAllocation.count({ where: { vehicleUnitId: v.id, active: true } })), 0);
  });

  test('alteração que colide não muda nada', async () => {
    const v = await createVehicle(A);
    const { customer, driver } = await createCustomer(A);
    const r1 = await request(owner, A, customer.id, driver.id, inDays(50), inDays(52));
    const r2 = await request(owner, A, customer.id, driver.id, inDays(55), inDays(57));
    await owner.post(`/reservations/${r1.id}/confirm`, { vehicleUnitId: v.id });
    await owner.post(`/reservations/${r2.id}/confirm`, { vehicleUnitId: v.id });
    const res = await owner.patch(`/reservations/${r1.id}`, { endAt: inDays(56).toISOString(), reason: 'Cliente quer mais dias' });
    assert.equal(res.status, 409);
    const still = await owner.get(`/reservations/${r1.id}`);
    assert.equal(new Date(still.data.endAt).toISOString(), inDays(52).toISOString());
    assert.equal(await asPlatform((tx) => tx.vehicleAllocation.count({ where: { reservationId: r1.id, active: true } })), 1);
  });
});

describe('Contrato: retirada, entrega, trocas e devolução', () => {
  let contractId: string;
  let vehicleId: string;
  let driver2Id: string;

  test('retirada transforma a reserva em contrato e o bloco da agenda em CONTRACT', async () => {
    const v = await createVehicle(A);
    vehicleId = v.id;
    const { customer, driver } = await createCustomer(A);
    driver2Id = (await createCustomer(A)).driver.id;
    const start = new Date(Date.now() + 3_600_000);
    const r = await request(owner, A, customer.id, driver.id, start, inDays(5));
    assert.equal((await owner.post(`/reservations/${r.id}/confirm`, { vehicleUnitId: v.id })).status, 200);
    const checkout = await owner.post(`/reservations/${r.id}/checkout`, {});
    assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
    contractId = checkout.data.id;
    assert.equal(checkout.data.status, 'APPROVED');
    const alloc = await asPlatform((tx) => tx.vehicleAllocation.findFirst({ where: { reservationId: r.id } }));
    assert.equal(alloc.kind, 'CONTRACT');
    assert.equal(alloc.active, true);
    assert.ok(alloc.contractVehicleId);
    const res = await owner.get(`/reservations/${r.id}`);
    assert.equal(res.data.status, 'CHECKED_OUT');
  });

  test('entrega sem vistoria de entrega é recusada; sem caução também', async () => {
    const noInspection = await owner.post(`/contracts/${contractId}/activate`, {});
    assert.equal(noInspection.status, 409);
    assert.match(noInspection.data.message, /vistoria de entrega/);
    await completedInspection(A, { contractId, vehicleUnitId: vehicleId, type: 'DELIVERY', odometerKm: 1000 });
    const noDeposit = await owner.post(`/contracts/${contractId}/activate`, {});
    assert.equal(noDeposit.status, 409);
    assert.match(noDeposit.data.message, /Caução/);
  });

  test('com caução recebido e vistoria concluída, o veículo é entregue', async () => {
    const detail = await owner.get(`/contracts/${contractId}`);
    const depositId = detail.data.deposit.id;
    const receipt = await owner.post(`/deposits/${depositId}/receipts`, { amount: 500, method: 'PIX', idempotencyKey: key() });
    assert.equal(receipt.status, 201);
    const res = await owner.post(`/contracts/${contractId}/activate`, {});
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const after = await owner.get(`/contracts/${contractId}`);
    assert.equal(after.data.status, 'ACTIVE');
    assert.equal(after.data.vehicles[0].startKm, 1000);
    assert.ok(after.data.receivables.some((r: any) => r.kind === 'RENTAL'));
    const vehicle = await asPlatform((tx) => tx.vehicleUnit.findUnique({ where: { id: vehicleId } }));
    assert.equal(vehicle.commercialStatus, 'RENTED');
  });

  test('troca de motorista encerra o vínculo anterior e cria outro', async () => {
    const res = await owner.post(`/contracts/${contractId}/swap-driver`, { driverId: driver2Id, reason: 'Funcionário substituído' });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const drivers = await asPlatform((tx) => tx.contractDriver.findMany({ where: { contractId }, orderBy: { createdAt: 'asc' } }));
    assert.equal(drivers.length, 2);
    assert.ok(drivers[0].endAt);
    assert.equal(drivers[1].endAt, null);
    assert.equal(drivers[1].driverId, driver2Id);
  });

  test('troca de veículo exige vistorias e preserva os dois intervalos', async () => {
    const next = await createVehicle(A);
    const blocked = await owner.post(`/contracts/${contractId}/swap-vehicle`, { newVehicleUnitId: next.id, reason: 'Pane elétrica' });
    assert.equal(blocked.status, 409);
    await completedInspection(A, { contractId, vehicleUnitId: vehicleId, type: 'RETURN', odometerKm: 1350 });
    await completedInspection(A, { contractId, vehicleUnitId: next.id, type: 'DELIVERY', odometerKm: 1000 });
    const res = await owner.post(`/contracts/${contractId}/swap-vehicle`, { newVehicleUnitId: next.id, reason: 'Pane elétrica' });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const intervals = await asPlatform((tx) => tx.contractVehicle.findMany({ where: { contractId }, orderBy: { createdAt: 'asc' } }));
    assert.equal(intervals.length, 2);
    assert.equal(intervals[0].vehicleUnitId, vehicleId);
    assert.equal(intervals[0].endKm, 1350);
    assert.ok(intervals[0].endAt);
    assert.equal(intervals[1].vehicleUnitId, next.id);
    assert.equal(intervals[1].endAt, null);
    const oldVehicle = await asPlatform((tx) => tx.vehicleUnit.findUnique({ where: { id: vehicleId } }));
    assert.notEqual(oldVehicle.commercialStatus, 'RENTED');
    const versions = await owner.get(`/contracts/${contractId}`);
    assert.ok(versions.data.versions.length >= 4);
    vehicleId = next.id;
  });

  test('encerramento exige vistoria de devolução e gera a prestação de contas', async () => {
    const without = await owner.post(`/contracts/${contractId}/close`, {});
    assert.equal(without.status, 409);
    await completedInspection(A, { contractId, vehicleUnitId: vehicleId, type: 'RETURN', odometerKm: 1100 });
    const res = await owner.post(`/contracts/${contractId}/close`, { damages: [{ description: 'Risco na porta', amount: 300 }] });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.status, 'CLOSED');
    assert.equal(res.data.settlement.drivenKm, 450);
    const detail = await owner.get(`/contracts/${contractId}`);
    assert.ok(detail.data.receivables.some((r: any) => r.kind === 'DAMAGE' && Number(r.amount) === 300));
    assert.equal(detail.data.deposit.status, 'REFUND_PENDING');
    assert.ok(detail.data.vehicles.every((v: any) => v.endAt));
  });
});

describe('Aprovação, alçada e isolamento', () => {
  test('aprovação acima da alçada é recusada', async () => {
    await asPlatform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { email: A.users.regional_manager } });
      await tx.membership.updateMany({ where: { organizationId: A.id, userId: user.id }, data: { approvalLimit: 1000 } });
    });
    const v = await createVehicle(A);
    const { customer, driver } = await createCustomer(A);
    const created = await owner.post('/contracts', {
      kind: 'LONG_TERM', branchId: A.branchId, customerId: customer.id, driverId: driver.id, vehicleUnitId: v.id,
      startAt: inDays(60).toISOString(), termMonths: 12,
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(Number(created.data.monthlyAmount), 2500);
    const manager = new Client();
    await manager.login(A.users.regional_manager!);
    const denied = await manager.post(`/contracts/${created.data.id}/approve`);
    assert.equal(denied.status, 403);
    assert.match(denied.data.message, /alçada/);
    assert.equal((await owner.post(`/contracts/${created.data.id}/approve`)).status, 200);
  });

  test('mensalidade fora da tabela exige permissão de alterar valores', async () => {
    const v = await createVehicle(A);
    const { customer, driver } = await createCustomer(A);
    const agent = new Client();
    await agent.login(A.users.rental_agent!);
    const res = await agent.post('/contracts', {
      kind: 'LONG_TERM', branchId: A.branchId, customerId: customer.id, driverId: driver.id, vehicleUnitId: v.id,
      startAt: inDays(70).toISOString(), termMonths: 6, monthlyAmount: 1500,
    });
    assert.equal(res.status, 403);
  });

  test('usuário de outra empresa não acessa contrato nem reserva por id', async () => {
    const list = await owner.get('/contracts?pageSize=1');
    const id = list.data.items[0].id;
    const intruder = new Client();
    await intruder.login(B.users.owner!);
    assert.equal((await intruder.get(`/contracts/${id}`)).status, 404);
    assert.equal((await intruder.post(`/contracts/${id}/approve`)).status, 404);
    const reservations = await owner.get('/reservations?pageSize=1');
    assert.equal((await intruder.get(`/reservations/${reservations.data.items[0].id}`)).status, 404);
    assert.ok(!(await intruder.get('/contracts')).data.items.some((c: any) => c.id === id));
  });

  test('atendente de uma filial não cria reserva na outra', async () => {
    const { customer, driver } = await createCustomer(A);
    const agent = new Client();
    await agent.login(A.users.rental_agent!);
    const res = await agent.post('/reservations', { customerId: customer.id, driverId: driver.id, categoryId, branchId: A.branch2Id, startAt: inDays(80).toISOString(), endAt: inDays(81).toISOString() });
    assert.equal(res.status, 403);
  });
});
