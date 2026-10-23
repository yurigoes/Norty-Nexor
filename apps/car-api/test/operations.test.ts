/**
 * Operação: estoque, compras, ordens de serviço, vistorias e abastecimentos.
 * Regras obrigatórias 5, 6 e 10, mais alçada, agenda e isolamento.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, fakePlate, fakeRenavam, fakeVin, startApi, stopApi } from './helpers';
import { asPlatform, createOrg, type TestOrg } from './db';

let A: TestOrg;
let B: TestOrg;
const owner = new Client('dono A');
const ownerB = new Client('dono B');
const key = () => randomUUID();

/** PNG mínimo: a assinatura binária basta para o detector de tipo. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

async function makeVehicle(org: TestOrg, odometerKm = 10_000): Promise<string> {
  return asPlatform(async (tx) => {
    const model = await tx.vehicleModel.findFirst({ where: { organizationId: org.id } });
    const v = await tx.vehicleUnit.create({
      data: {
        organizationId: org.id, branchId: org.branchId, modelId: model.id, categoryId: model.categoryId,
        internalCode: `T-${randomUUID().slice(0, 6)}`, plate: fakePlate(), renavam: fakeRenavam(), chassis: fakeVin(),
        yearManufacture: 2024, yearModel: 2025, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', odometerKm,
      },
    });
    return v.id;
  });
}

async function location(org: TestOrg, branchId = org.branchId): Promise<string> {
  return asPlatform(async (tx) => (await tx.inventoryLocation.findFirst({ where: { organizationId: org.id, branchId } })).id);
}

async function product(client: Client, org: TestOrg): Promise<string> {
  const category = await asPlatform((tx) => tx.inventoryCategory.findFirst({ where: { organizationId: org.id } }));
  const res = await client.post('/inventory/products', { sku: `P-${randomUUID().slice(0, 8)}`, description: 'Filtro de óleo de teste', categoryId: category.id, minStock: 2 });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data.id;
}

async function stockIn(client: Client, productId: string, locationId: string, quantity: number, unitCost: number) {
  const res = await client.post('/inventory/movements', { productId, locationId, type: 'MANUAL_IN', quantity, unitCost, idempotencyKey: key() });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data;
}

async function balance(productId: string, locationId: string): Promise<number> {
  const b = await asPlatform((tx) => tx.stockBalance.findUnique({ where: { productId_locationId: { productId, locationId } } }));
  return Number(b?.quantity ?? 0);
}

async function serviceType(org: TestOrg): Promise<string> {
  return asPlatform(async (tx) => (await tx.maintenanceServiceType.findFirst({ where: { organizationId: org.id } })).id);
}

before(async () => {
  await startApi();
  A = await createOrg();
  B = await createOrg();
  await owner.login(A.users.owner!);
  await ownerB.login(B.users.owner!);
});
after(stopApi);

describe('Estoque', () => {
  test('saída maior que o saldo é recusada e o saldo fica intacto', async () => {
    const p = await product(owner, A);
    const loc = await location(A);
    await stockIn(owner, p, loc, 3, 10);
    const res = await owner.post('/inventory/movements', { productId: p, locationId: loc, type: 'LOSS', quantity: 5, reason: 'avaria', idempotencyKey: key() });
    assert.equal(res.status, 409);
    assert.match(res.data.message, /Saldo insuficiente/);
    assert.equal(await balance(p, loc), 3);
  });

  test('duas saídas simultâneas que juntas excedem o saldo: só uma passa', async () => {
    const p = await product(owner, A);
    const loc = await location(A);
    await stockIn(owner, p, loc, 5, 10);
    const out = () => owner.post('/inventory/movements', { productId: p, locationId: loc, type: 'LOSS', quantity: 3, reason: 'teste', idempotencyKey: key() });
    const results = await Promise.all([out(), out()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await balance(p, loc), 2);
  });

  test('a mesma chave de idempotência não duplica o movimento', async () => {
    const p = await product(owner, A);
    const loc = await location(A);
    const body = { productId: p, locationId: loc, type: 'MANUAL_IN', quantity: 4, unitCost: 12, idempotencyKey: key() };
    const r1 = await owner.post('/inventory/movements', body);
    const r2 = await owner.post('/inventory/movements', body);
    assert.equal(r1.data.id, r2.data.id);
    assert.equal(await balance(p, loc), 4);
    const list = await owner.get(`/inventory/movements?productId=${p}`);
    assert.equal(list.data.total, 1);
  });

  test('movimentação é imutável no banco', async () => {
    const p = await product(owner, A);
    const loc = await location(A);
    const m = await stockIn(owner, p, loc, 1, 5);
    await assert.rejects(asPlatform((tx) => tx.inventoryMovement.update({ where: { id: m.id }, data: { quantity: 100 } })), /imutável/);
    await assert.rejects(asPlatform((tx) => tx.inventoryMovement.delete({ where: { id: m.id } })), /imutável/);
  });

  test('transferência mantém a soma dos saldos', async () => {
    const p = await product(owner, A);
    const from = await location(A);
    const to = await location(A, A.branch2Id);
    await stockIn(owner, p, from, 10, 8);
    const res = await owner.post('/inventory/transfers', { productId: p, fromLocationId: from, toLocationId: to, quantity: 4, idempotencyKey: key() });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(await balance(p, from), 6);
    assert.equal(await balance(p, to), 4);
  });

  test('custo médio ponderado após duas entradas', async () => {
    const p = await product(owner, A);
    const loc = await location(A);
    await stockIn(owner, p, loc, 10, 20);
    await stockIn(owner, p, loc, 10, 30);
    const res = await owner.get(`/inventory/products/${p}`);
    assert.equal(res.data.averageCost, 25);
    assert.equal(res.data.stock, 20);
  });

  test('estorno devolve o saldo e não pode ser repetido', async () => {
    const p = await product(owner, A);
    const loc = await location(A);
    const m = await stockIn(owner, p, loc, 6, 10);
    const r1 = await owner.post(`/inventory/movements/${m.id}/reverse`, { reason: 'lançado em dobro', idempotencyKey: key() });
    assert.equal(r1.status, 201, JSON.stringify(r1.data));
    assert.equal(await balance(p, loc), 0);
    const r2 = await owner.post(`/inventory/movements/${m.id}/reverse`, { reason: 'de novo', idempotencyKey: key() });
    assert.equal(r2.status, 409);
  });

  test('compra aprovada e recebida gera entrada e conta a pagar aprovada', async () => {
    const p = await product(owner, A);
    const loc = await location(A);
    const supplier = await asPlatform((tx) => tx.supplier.create({ data: { organizationId: A.id, name: `Autopeças ${randomUUID().slice(0, 4)}` } }));
    const po = await owner.post('/purchase-orders', { branchId: A.branchId, supplierId: supplier.id, items: [{ productId: p, quantity: 10, unitCost: 15 }] });
    assert.equal(po.status, 201, JSON.stringify(po.data));
    assert.equal((await owner.post(`/purchase-orders/${po.data.id}/approve`)).status, 200);
    const detail = await owner.get(`/purchase-orders/${po.data.id}`);
    const receiveBody = { locationId: loc, items: [{ itemId: detail.data.items[0].id, quantity: 6 }], idempotencyKey: key() };
    const r = await owner.post(`/purchase-orders/${po.data.id}/receive`, receiveBody);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.status, 'PARTIALLY_RECEIVED');
    await owner.post(`/purchase-orders/${po.data.id}/receive`, receiveBody);
    assert.equal(await balance(p, loc), 6);
    const payables = await asPlatform((tx) => tx.payable.findMany({ where: { purchaseOrderId: po.data.id } }));
    assert.equal(payables.length, 1);
    assert.equal(Number(payables[0].amount), 90);
    assert.equal(payables[0].approval, 'APPROVED');
  });
});

describe('Ordens de serviço', () => {
  test('OS que bloqueia o veículo ocupa a agenda e impede reserva no período', async () => {
    const vehicle = await makeVehicle(A);
    const due = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const wo = await owner.post('/work-orders', { vehicleUnitId: vehicle, serviceTypeId: await serviceType(A), kind: 'CORRECTIVE', description: 'Barulho na suspensão', dueAt: due });
    assert.equal(wo.status, 201, JSON.stringify(wo.data));
    const allocation = await asPlatform((tx) => tx.vehicleAllocation.findFirst({ where: { workOrderId: wo.data.id, active: true } }));
    assert.equal(allocation.kind, 'MAINTENANCE');
    const v = await asPlatform((tx) => tx.vehicleUnit.findUnique({ where: { id: vehicle } }));
    assert.equal(v.operationalStatus, 'IN_MAINTENANCE');
    await assert.rejects(asPlatform((tx) => tx.vehicleAllocation.create({
      data: {
        organizationId: A.id, vehicleUnitId: vehicle, kind: 'RESERVATION', startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 3 * 86_400_000), blockedUntil: new Date(Date.now() + 3 * 86_400_000),
      },
    })), /no_overlap/);
  });

  test('aprovação acima da alçada é recusada', async () => {
    await asPlatform(async (tx) => {
      const user = await tx.user.findUnique({ where: { email: A.users.branch_manager } });
      await tx.membership.updateMany({ where: { userId: user.id, organizationId: A.id }, data: { approvalLimit: 100 } });
    });
    const manager = new Client('gerente');
    await manager.login(A.users.branch_manager!);
    const vehicle = await makeVehicle(A);
    const wo = await manager.post('/work-orders', { vehicleUnitId: vehicle, serviceTypeId: await serviceType(A), kind: 'CORRECTIVE', description: 'Troca de embreagem', estimateAmount: 500, blocksVehicle: false });
    assert.equal(wo.status, 201, JSON.stringify(wo.data));
    assert.equal(wo.data.status, 'AWAITING_APPROVAL');
    const denied = await manager.post(`/work-orders/${wo.data.id}/approve`, {});
    assert.equal(denied.status, 403);
    const ok = await owner.post(`/work-orders/${wo.data.id}/approve`, {});
    assert.equal(ok.status, 200);
    assert.equal(ok.data.status, 'IN_PROGRESS');
  });

  test('peça na OS baixa o estoque, aparece na linha do tempo e o ciclo fecha com liberação', async () => {
    const vehicle = await makeVehicle(A);
    const p = await product(owner, A);
    const loc = await location(A);
    await stockIn(owner, p, loc, 5, 40);
    const wo = await owner.post('/work-orders', { vehicleUnitId: vehicle, serviceTypeId: await serviceType(A), kind: 'PREVENTIVE', description: 'Troca de filtro' });
    assert.equal(wo.status, 201);
    const itemBody = { type: 'PART', productId: p, locationId: loc, quantity: 2, idempotencyKey: key() };
    const item = await owner.post(`/work-orders/${wo.data.id}/items`, itemBody);
    assert.equal(item.status, 201, JSON.stringify(item.data));
    const again = await owner.post(`/work-orders/${wo.data.id}/items`, itemBody);
    assert.equal(again.data.id, item.data.id);
    assert.equal(await balance(p, loc), 3);
    const timeline = await asPlatform((tx) => tx.vehicleTimelineEvent.findMany({ where: { vehicleUnitId: vehicle, type: 'PART_USED' } }));
    assert.equal(timeline.length, 1);
    await owner.post(`/work-orders/${wo.data.id}/items`, { type: 'LABOR', description: 'Mão de obra', quantity: 1, unitCost: 50, idempotencyKey: key() });
    assert.equal((await owner.post(`/work-orders/${wo.data.id}/status`, { to: 'IN_PROGRESS' })).status, 200);
    const done = await owner.post(`/work-orders/${wo.data.id}/complete`, { odometerKm: 10_500 });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    const detail = await owner.get(`/work-orders/${wo.data.id}`);
    assert.equal(detail.data.totalCost, 130);
    const released = await owner.post(`/work-orders/${wo.data.id}/release`, {});
    assert.equal(released.status, 200, JSON.stringify(released.data));
    const v = await asPlatform((tx) => tx.vehicleUnit.findUnique({ where: { id: vehicle } }));
    assert.equal(v.operationalStatus, 'RELEASED');
    assert.equal(v.odometerKm, 10_500);
  });

  test('sinistro vinculado recebe a OS', async () => {
    const vehicle = await makeVehicle(A);
    const claim = await asPlatform((tx) => tx.claim.create({ data: { organizationId: A.id, branchId: A.branchId, number: `SIN-${randomUUID().slice(0, 6)}`, vehicleUnitId: vehicle, type: 'COLLISION', occurredAt: new Date(), description: 'Colisão leve' } }));
    const wo = await owner.post('/work-orders', { vehicleUnitId: vehicle, serviceTypeId: await serviceType(A), kind: 'CORRECTIVE', description: 'Reparo de lataria', claimId: claim.id, blocksVehicle: false });
    assert.equal(wo.status, 201, JSON.stringify(wo.data));
    const updated = await asPlatform((tx) => tx.claim.findUnique({ where: { id: claim.id } }));
    assert.equal(updated.workOrderId, wo.data.id);
  });
});

describe('Vistorias', () => {
  async function newInspection(vehicle: string) {
    const res = await owner.post('/inspections', { type: 'PERIODIC', vehicleUnitId: vehicle });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data;
  }

  async function uploadPhoto(inspectionId: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'foto.png');
    form.append('entityType', 'Inspection');
    form.append('entityId', inspectionId);
    const res = await owner.req('POST', '/files', form);
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data.id;
  }

  test('conclusão sem quilometragem é recusada', async () => {
    const insp = await newInspection(await makeVehicle(A));
    const res = await owner.post(`/inspections/${insp.id}/complete`, { confirmationType: 'ACKNOWLEDGED_IN_PERSON', signerName: 'Cliente Teste' });
    assert.equal(res.status, 400);
  });

  test('vistoria concluída tem evidências congeladas', async () => {
    const insp = await newInspection(await makeVehicle(A));
    const fileId = await uploadPhoto(insp.id);
    assert.equal((await owner.post(`/inspections/${insp.id}/photos`, { fileId, itemKey: 'hood' })).status, 201);
    await owner.req('PUT', `/inspections/${insp.id}/items/hood`, { status: 'DAMAGED', notes: 'Risco no capô' });
    await owner.patch(`/inspections/${insp.id}`, { odometerKm: 10_200, fuelEighths: 6 });
    const done = await owner.post(`/inspections/${insp.id}/complete`, { confirmationType: 'ACKNOWLEDGED_IN_PERSON', signerName: 'Cliente Teste' });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    const other = await uploadPhoto(insp.id);
    assert.equal((await owner.post(`/inspections/${insp.id}/photos`, { fileId: other })).status, 409);
    assert.equal((await owner.req('PUT', `/inspections/${insp.id}/items/hood`, { status: 'OK' })).status, 409);
    await assert.rejects(asPlatform((tx) => tx.inspectionPhoto.deleteMany({ where: { inspectionId: insp.id } })), /Evidências/);
    await assert.rejects(asPlatform((tx) => tx.inspection.update({ where: { id: insp.id }, data: { odometerKm: 1 } })), /Vistoria concluída/);
  });

  test('comparação aponta avaria nova para revisão humana', async () => {
    const vehicle = await makeVehicle(A);
    const base = await newInspection(vehicle);
    await owner.patch(`/inspections/${base.id}`, { odometerKm: 10_100, fuelEighths: 8 });
    await owner.post(`/inspections/${base.id}/complete`, { confirmationType: 'ACKNOWLEDGED_IN_PERSON', signerName: 'Cliente' });
    const current = await newInspection(vehicle);
    await owner.patch(`/inspections/${current.id}`, { odometerKm: 11_000, fuelEighths: 4 });
    await owner.post(`/inspections/${current.id}/damages`, { region: 'left_front_door', severity: 'LIGHT', description: 'Amassado' });
    await owner.post(`/inspections/${current.id}/complete`, { confirmationType: 'ACKNOWLEDGED_IN_PERSON', signerName: 'Cliente' });
    const cmp = await owner.get(`/inspections/compare?base=${base.id}&current=${current.id}`);
    assert.equal(cmp.status, 200, JSON.stringify(cmp.data));
    assert.equal(cmp.data.damages.newInCurrent.length, 1);
    assert.equal(cmp.data.damages.newInCurrent[0].region, 'left_front_door');
    assert.equal(cmp.data.humanReviewRequired, true);
    assert.equal(cmp.data.odometerDelta, 900);
    assert.equal(cmp.data.aiVisualComparison.status, 'NOT_CONFIGURED');
  });
});

describe('Pneus e rotinas agendadas', () => {
  test('dois pneus não ocupam a mesma posição e a retirada acumula a quilometragem', async () => {
    const vehicle = await makeVehicle(A, 30_000);
    const t1 = await owner.post('/tires', { code: `PN-${randomUUID().slice(0, 6)}`, brand: 'Marca', size: '185/65 R15', cost: 400 });
    const t2 = await owner.post('/tires', { code: `PN-${randomUUID().slice(0, 6)}`, brand: 'Marca', size: '185/65 R15', cost: 400 });
    assert.equal((await owner.post(`/tires/${t1.data.id}/events`, { type: 'INSTALL', vehicleUnitId: vehicle, position: 'FL', odometerKm: 30_000 })).status, 201);
    assert.equal((await owner.post(`/tires/${t2.data.id}/events`, { type: 'INSTALL', vehicleUnitId: vehicle, position: 'FL', odometerKm: 30_000 })).status, 409);
    await owner.post(`/tires/${t1.data.id}/events`, { type: 'REMOVE', odometerKm: 34_000 });
    const tire = await owner.get(`/tires/${t1.data.id}`);
    assert.equal(tire.data.kmDriven, 4_000);
    assert.equal(tire.data.costPerKm, 0.1);
  });

  test('plano vencido com bloqueio bloqueia o veículo e gera um único alerta', async () => {
    const vehicle = await makeVehicle(A, 25_000);
    const plan = await owner.post('/maintenance/plans', { vehicleUnitId: vehicle, serviceTypeId: await serviceType(A), name: 'Revisão 10 mil', intervalKm: 10_000, lastDoneKm: 10_000, blockWhenOverdue: true });
    assert.equal(plan.status, 201, JSON.stringify(plan.data));
    const { maintenanceAlerts } = require('../dist/modules/maintenance/maintenance.jobs');
    const run = () => asPlatform((tx) => maintenanceAlerts(tx, A.id));
    const first = await run();
    assert.ok(first.some((a: any) => a.planId === plan.data.id && a.state === 'OVERDUE' && a.blocked));
    await run();
    const v = await asPlatform((tx) => tx.vehicleUnit.findUnique({ where: { id: vehicle } }));
    assert.equal(v.operationalStatus, 'BLOCKED');
    const alerts = await asPlatform((tx) => tx.notification.count({ where: { organizationId: A.id, dedupeKey: { startsWith: `plan:${plan.data.id}:` } } }));
    assert.equal(alerts, 1);
  });
});

describe('Abastecimentos e isolamento', () => {
  test('quilometragem regressiva é sinalizada e não altera o hodômetro', async () => {
    const vehicle = await makeVehicle(A, 20_000);
    const res = await owner.post('/refuels', { vehicleUnitId: vehicle, at: new Date().toISOString(), fuel: 'FLEX', liters: 30, pricePerLiter: 6, total: 180, odometerKm: 15_000 });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.ok(res.data.flags.includes('KM_REGRESSION'));
    const v = await asPlatform((tx) => tx.vehicleUnit.findUnique({ where: { id: vehicle } }));
    assert.equal(v.odometerKm, 20_000);
  });

  test('produto e OS de outra empresa respondem 404', async () => {
    const p = await product(owner, A);
    const wo = await owner.post('/work-orders', { vehicleUnitId: await makeVehicle(A), serviceTypeId: await serviceType(A), kind: 'CORRECTIVE', description: 'Teste de isolamento', blocksVehicle: false });
    assert.equal((await ownerB.get(`/inventory/products/${p}`)).status, 404);
    assert.equal((await ownerB.get(`/work-orders/${wo.data.id}`)).status, 404);
    const list = await ownerB.get(`/work-orders?q=${wo.data.number}`);
    assert.equal(list.data.total, 0);
    const move = await ownerB.post('/inventory/movements', { productId: p, locationId: await location(B), type: 'MANUAL_IN', quantity: 1, unitCost: 1, idempotencyKey: key() });
    assert.equal(move.status, 404);
  });
});
