/**
 * Frota e pessoas: cadastro de veículo, duplicidade, isolamento entre
 * empresas e filiais, situação e bloqueio, disponibilidade, clientes,
 * motoristas, LGPD e documentos a vencer.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, fakeCpf, fakePlate, fakeRenavam, fakeVin, inDays, iso, startApi, stopApi } from './helpers';
import { asPlatform, createOrg, type TestOrg } from './db';

let A: TestOrg;
let B: TestOrg;
const ownerA = new Client('dono A');
const ownerB = new Client('dono B');
let modelId: string;

async function newVehicle(c: Client, org: TestOrg, extra: Record<string, unknown> = {}) {
  return c.post('/vehicles', {
    branchId: org.branchId, modelId, plate: fakePlate(), renavam: fakeRenavam(), chassis: fakeVin(),
    yearManufacture: 2024, yearModel: 2025, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', odometerKm: 1200, ...extra,
  });
}

before(async () => {
  await startApi();
  A = await createOrg();
  B = await createOrg();
  await ownerA.login(A.users.owner!);
  await ownerB.login(B.users.owner!);
  const models = await ownerA.get('/catalog/models');
  modelId = models.data.find((m: any) => m.name === 'Onix').id;
});
after(stopApi);

describe('Veículos', () => {
  test('cadastro válido gera código interno, linha do tempo e leitura de hodômetro', async () => {
    const res = await newVehicle(ownerA, A);
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.match(res.data.internalCode, /^VEI-\d{5}$/);
    const tl = await ownerA.get(`/vehicles/${res.data.id}/timeline`);
    assert.equal(tl.data.items[0].type, 'CREATED');
    const detail = await ownerA.get(`/vehicles/${res.data.id}`);
    assert.equal(detail.data.initialOdometerKm, 1200);
    assert.equal(detail.data.category.name, 'Compacto');
  });

  test('placa duplicada → 409; RENAVAM e chassi inválidos → 400', async () => {
    const plate = fakePlate();
    assert.equal((await newVehicle(ownerA, A, { plate })).status, 201);
    const dup = await newVehicle(ownerA, A, { plate: `${plate.slice(0, 3)}-${plate.slice(3)}` });
    assert.equal(dup.status, 409);
    assert.match(dup.data.message, /placa/);
    const check = await ownerA.get(`/vehicles/check-duplicates?plate=${plate}`);
    assert.equal(check.data.plate, true);
    assert.equal((await newVehicle(ownerA, A, { renavam: '12345678901' })).status, 400);
    assert.equal((await newVehicle(ownerA, A, { chassis: '9BWZZZ377VT00425I' })).status, 400);
    assert.equal((await newVehicle(ownerA, A, { yearManufacture: 2024, yearModel: 2026 })).status, 400);
  });

  test('a mesma placa pode existir em outra empresa', async () => {
    const plate = fakePlate();
    const bModels = await ownerB.get('/catalog/models');
    const bModel = bModels.data.find((m: any) => m.name === 'Spin').id;
    assert.equal((await newVehicle(ownerA, A, { plate })).status, 201);
    const b = await ownerB.post('/vehicles', {
      branchId: B.branchId, modelId: bModel, plate, yearManufacture: 2023, yearModel: 2023, color: 'Branco', fuel: 'FLEX', transmission: 'MANUAL', odometerKm: 0,
    });
    assert.equal(b.status, 201);
  });

  test('empresa B não lê nem altera veículo da A por id, nem vê na lista', async () => {
    const v = await newVehicle(ownerA, A);
    assert.equal((await ownerB.get(`/vehicles/${v.data.id}`)).status, 404);
    assert.equal((await ownerB.patch(`/vehicles/${v.data.id}`, { color: 'Invadido' })).status, 404);
    assert.equal((await ownerB.get(`/vehicles/${v.data.id}/timeline`)).status, 404);
    const list = await ownerB.get('/vehicles?pageSize=200');
    assert.ok(!list.data.items.some((x: any) => x.id === v.data.id));
  });

  test('gerente de loja não cadastra em filial não autorizada', async () => {
    const mgr = new Client();
    await mgr.login(A.users.branch_manager!);
    // O gerente de loja do modelo não tem fleet.create; o regional é limitado à filial atribuída.
    const regional = new Client();
    await asPlatform(async (tx) => {
      const m = await tx.membership.findFirst({ where: { organizationId: A.id, role: { key: 'regional_manager' } } });
      await tx.membership.update({ where: { id: m.id }, data: { allBranches: false } });
      await tx.membershipBranch.create({ data: { membershipId: m.id, branchId: A.branchId, organizationId: A.id } });
    });
    await regional.login(A.users.regional_manager!);
    const denied = await newVehicle(regional, { ...A, branchId: A.branch2Id });
    assert.equal(denied.status, 403);
    const ok = await newVehicle(regional, A);
    assert.equal(ok.status, 201);
  });

  test('valores patrimoniais só com fleet.financials', async () => {
    const v = await newVehicle(ownerA, A, { acquisitionValue: 89990.5 });
    assert.equal((await ownerA.get(`/vehicles/${v.data.id}`)).data.acquisitionValue, 89990.5);
    const agent = new Client();
    await agent.login(A.users.inspector!);
    const seen = await agent.get(`/vehicles/${v.data.id}`);
    assert.equal(seen.status, 200);
    assert.equal(seen.data.acquisitionValue, undefined);
  });

  test('bloqueio: atendente não libera; gerente libera com motivo', async () => {
    const v = await newVehicle(ownerA, A);
    const blocked = await ownerA.post(`/vehicles/${v.data.id}/status`, { field: 'OPERATIONAL', to: 'BLOCKED', reason: 'Pendência documental' });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.data.operationalStatus, 'BLOCKED');
    // Atendente não tem fleet.status; o vistoriador também não — damos fleet.status a um perfil sem fleet.unblock.
    await asPlatform(async (tx) => {
      const role = await tx.role.findFirst({ where: { organizationId: A.id, key: 'rental_agent' } });
      await tx.role.update({ where: { id: role.id }, data: { permissions: [...role.permissions, 'fleet.status'] } });
    });
    const agent = new Client();
    await agent.login(A.users.rental_agent!);
    const denied = await agent.post(`/vehicles/${v.data.id}/status`, { field: 'OPERATIONAL', to: 'RELEASED', reason: 'tentativa' });
    assert.equal(denied.status, 403);
    const mgr = new Client();
    await mgr.login(A.users.branch_manager!);
    assert.equal((await mgr.post(`/vehicles/${v.data.id}/status`, { field: 'OPERATIONAL', to: 'RELEASED' })).status, 400);
    const ok = await mgr.post(`/vehicles/${v.data.id}/status`, { field: 'OPERATIONAL', to: 'RELEASED', reason: 'Documento regularizado' });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.operationalStatus, 'RELEASED');
  });

  test('situação comercial: vendido e alugado não são manuais', async () => {
    const v = await newVehicle(ownerA, A);
    assert.equal((await ownerA.post(`/vehicles/${v.data.id}/status`, { field: 'COMMERCIAL', to: 'SOLD' })).status, 400);
    assert.equal((await ownerA.post(`/vehicles/${v.data.id}/status`, { field: 'COMMERCIAL', to: 'RENTED' })).status, 400);
    assert.equal((await ownerA.post(`/vehicles/${v.data.id}/status`, { field: 'COMMERCIAL', to: 'FOR_SALE', reason: 'Renovação de frota' })).data.commercialStatus, 'FOR_SALE');
  });

  test('hodômetro manual não regride', async () => {
    const v = await newVehicle(ownerA, A);
    assert.equal((await ownerA.post(`/vehicles/${v.data.id}/odometer`, { km: 500 })).status, 400);
    assert.equal((await ownerA.post(`/vehicles/${v.data.id}/odometer`, { km: 2500 })).data.odometerKm, 2500);
  });
});

describe('Disponibilidade e agenda', () => {
  test('exclui bloqueado e à venda, respeita alocação e preparo', async () => {
    const cats = await ownerA.get('/catalog/categories');
    const suv = cats.data.find((c: any) => c.code === 'SUV').id;
    const duster = (await ownerA.get('/catalog/models')).data.find((m: any) => m.name === 'Duster').id;
    const free = await newVehicle(ownerA, A, { modelId: duster });
    const blocked = await newVehicle(ownerA, A, { modelId: duster });
    const forSale = await newVehicle(ownerA, A, { modelId: duster });
    const busy = await newVehicle(ownerA, A, { modelId: duster });
    await ownerA.post(`/vehicles/${blocked.data.id}/status`, { field: 'OPERATIONAL', to: 'BLOCKED', reason: 'Sinistro' });
    await ownerA.post(`/vehicles/${forSale.data.id}/status`, { field: 'COMMERCIAL', to: 'FOR_SALE', reason: 'Venda' });
    // Bloqueio de agenda que termina às 10h do dia 5; com preparo de 2h, o carro só fica livre às 12h.
    const blk = await ownerA.post(`/vehicles/${busy.data.id}/blocks`, { startsAt: iso(inDays(3)), endsAt: iso(inDays(5)), reason: 'Evento' });
    assert.equal(blk.status, 201, JSON.stringify(blk.data));

    const q = (start: Date, end: Date) => ownerA.get(`/availability?startAt=${iso(start)}&endAt=${iso(end)}&categoryId=${suv}`);
    const ids = (r: any) => r.data.units.map((u: any) => u.id);
    const overlap = await q(inDays(4), inDays(6));
    assert.ok(ids(overlap).includes(free.data.id));
    assert.ok(!ids(overlap).includes(blocked.data.id));
    assert.ok(!ids(overlap).includes(forSale.data.id));
    assert.ok(!ids(overlap).includes(busy.data.id));
    // Bloqueio manual não tem preparo: logo depois dele o carro está livre.
    const afterBlock = await q(new Date(inDays(5).getTime() + 3_600_000), inDays(7));
    assert.ok(ids(afterBlock).includes(busy.data.id), 'livre depois do bloqueio');
    // A locação nova, sim: devolver 1h antes do bloqueio não deixa as 2h de preparo.
    const beforeBlock = await q(inDays(1), new Date(inDays(3).getTime() - 3_600_000));
    assert.ok(!ids(beforeBlock).includes(busy.data.id), 'preparo da locação nova invadiria o bloqueio');
    const wellBefore = await q(inDays(1), new Date(inDays(3).getTime() - 3 * 3_600_000));
    assert.ok(ids(wellBefore).includes(busy.data.id), 'com folga para o preparo');
    assert.ok(overlap.data.byCategory[0].available >= 1);

    // Sobreposição de bloqueio no mesmo carro é recusada pelo banco.
    const clash = await ownerA.post(`/vehicles/${busy.data.id}/blocks`, { startsAt: iso(inDays(4)), endsAt: iso(inDays(6)), reason: 'Outro' });
    assert.equal(clash.status, 409);
  });

  test('exclusão lógica recusada com alocação futura e aceita depois de liberar', async () => {
    const v = await newVehicle(ownerA, A);
    const blk = await ownerA.post(`/vehicles/${v.data.id}/blocks`, { startsAt: iso(inDays(10)), endsAt: iso(inDays(12)), reason: 'Reserva técnica' });
    const refused = await ownerA.del(`/vehicles/${v.data.id}`, { reason: 'Saiu da frota' });
    assert.equal(refused.status, 409);
    assert.equal((await ownerA.del(`/vehicles/${v.data.id}/blocks/${blk.data.id}`, { reason: 'Cancelado' })).status, 204);
    assert.equal((await ownerA.del(`/vehicles/${v.data.id}`, { reason: 'Saiu da frota' })).status, 204);
    const list = await ownerA.get('/vehicles?pageSize=200');
    assert.ok(!list.data.items.some((x: any) => x.id === v.data.id));
    // O histórico continua acessível pela placa.
    const byPlate = await ownerA.get(`/vehicles/by-plate/${(await ownerA.get(`/vehicles/${v.data.id}`)).data.plate}`);
    assert.equal(byPlate.status, 200);
  });
});

describe('Clientes e motoristas', () => {
  test('CPF inválido 400, duplicado 409', async () => {
    const cpf = fakeCpf();
    assert.equal((await ownerA.post('/customers', { type: 'PF', name: 'Cliente Teste', document: '111.111.111-11' })).status, 400);
    assert.equal((await ownerA.post('/customers', { type: 'PF', name: 'Cliente Teste', document: cpf })).status, 201);
    const dup = await ownerA.post('/customers', { type: 'PF', name: 'Outro', document: cpf });
    assert.equal(dup.status, 409);
    assert.equal((await ownerA.post('/customers', { type: 'PJ', name: 'Empresa', document: '11.222.333/0001-80' })).status, 400);
  });

  test('documento mascarado para quem não tem customers.sensitive', async () => {
    const cpf = fakeCpf();
    const created = await ownerA.post('/customers', { type: 'PF', name: 'Cliente Máscara', document: cpf, birthDate: '1990-05-01' });
    const agent = new Client();
    await agent.login(A.users.rental_agent!);
    const seen = await agent.get(`/customers/${created.data.id}`);
    assert.match(seen.data.document, /^\*\*\*\./);
    assert.equal(seen.data.birthDate, null);
    const full = await ownerA.get(`/customers/${created.data.id}`);
    assert.equal(full.data.document.replace(/\D/g, ''), cpf);
    assert.equal((await agent.get(`/customers/${created.data.id}/personal-data`)).status, 403);
    assert.equal((await ownerB.get(`/customers/${created.data.id}`)).status, 404);
  });

  test('anonimização recusada com contrato ativo e efetiva sem', async () => {
    const created = await ownerA.post('/customers', { type: 'PF', name: 'Titular LGPD', document: fakeCpf(), email: 'titular@teste.test' });
    const id = created.data.id;
    const driver = await ownerA.post(`/customers/${id}/as-driver`, { cnhNumber: '12345678901', cnhCategory: 'B', cnhExpiresAt: '2030-01-01' });
    assert.equal(driver.status, 201);
    const contract = await asPlatform((tx) => tx.rentalContract.create({
      data: {
        organizationId: A.id, branchId: A.branchId, number: `T-${Date.now()}`, kind: 'PERIOD', status: 'ACTIVE', customerId: id,
        startAt: inDays(-1), endAt: inDays(5),
      },
    }));
    const refused = await ownerA.post(`/customers/${id}/anonymize`, { reason: 'Pedido do titular' });
    assert.equal(refused.status, 409);
    await asPlatform((tx) => tx.rentalContract.update({ where: { id: contract.id }, data: { status: 'CLOSED' } }));
    const ok = await ownerA.post(`/customers/${id}/anonymize`, { reason: 'Pedido do titular' });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const after = await ownerA.get(`/customers/${id}`);
    assert.equal(after.data.name, 'Titular anonimizado');
    assert.equal(after.data.email, null);
    const d = await ownerA.get(`/drivers/${driver.data.id}`);
    assert.equal(d.status, 404);
  });

  test('motorista: CPF válido e CNH obrigatórios; documentos a vencer listam CNH vencendo', async () => {
    assert.equal((await ownerA.post('/drivers', { name: 'Sem CNH', cpf: fakeCpf() })).status, 400);
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const d = await ownerA.post('/drivers', { name: 'Motorista Vencendo', cpf: fakeCpf(), cnhNumber: '98765432100', cnhCategory: 'B', cnhExpiresAt: soon });
    assert.equal(d.status, 201);
    const expiring = await ownerA.get('/drivers?cnhExpiringDays=30');
    assert.ok(expiring.data.items.some((x: any) => x.id === d.data.id));
    const docs = await ownerA.get('/documents/expiring?days=30');
    const cnh = docs.data.items.find((i: any) => i.type === 'CNH' && i.entityId === d.data.id);
    assert.ok(cnh);
    assert.ok(cnh.daysLeft <= 10 && cnh.daysLeft >= 9);
    const docsB = await ownerB.get('/documents/expiring?days=30');
    assert.ok(!docsB.data.items.some((i: any) => i.entityId === d.data.id));
  });
});
