/**
 * Aceitação ponta a ponta — critérios do item 36 do pedido, na ordem.
 *
 * Um único fluxo encadeado, só por HTTP contra a API real: do Master
 * criando a locadora até a devolução do carro, o histórico da placa, a
 * rentabilidade, o portal do cliente, o site público e o isolamento entre
 * empresas. O banco só é tocado para ativar o MFA do Master (como o
 * usuário faria no app autenticador) e para conferir efeitos.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, PASSWORD, fakeCpf, fakePlate, fakeRenavam, fakeVin, inDays, iso, startApi, stopApi, unique } from './helpers';
import { asPlatform, createOrg, createPlatformUser, db, type TestOrg } from './db';
import { totpCode } from '../src/common/totp';

const NEW_PASSWORD = 'Aceitacao#2026x';
const key = () => `aceite-${randomUUID()}`;
/** PNG 1×1 válido: a API decide o tipo pelos bytes. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Usa o link de definição de senha e entra. */
async function acceptInvite(link: string, email: string, match?: (c: any) => boolean): Promise<Client> {
  const token = decodeURIComponent(link.split('token=')[1]!);
  const reset = await new Client().post('/auth/password/reset', { token, newPassword: NEW_PASSWORD });
  assert.equal(reset.status, 204, JSON.stringify(reset.data));
  const c = new Client(email);
  const res = await c.login(email, match, NEW_PASSWORD);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return c;
}

function ok(res: { status: number; data: unknown }, expected: number | number[] = [200, 201], label = ''): void {
  const list = Array.isArray(expected) ? expected : [expected];
  assert.ok(list.includes(res.status), `${label} → ${res.status}: ${JSON.stringify(res.data)}`);
}

async function uploadPhoto(c: Client, entityType: string, entityId: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'foto.png');
  form.append('entityType', entityType);
  form.append('entityId', entityId);
  form.append('category', 'photo');
  const res = await c.post('/files', form);
  ok(res, 201, 'upload');
  return res.data.id;
}

/** Vistoria completa pelo módulo de vistorias, com foto real. */
async function inspect(c: Client, input: { type: string; vehicleUnitId: string; contractId: string; odometerKm: number; fuelEighths?: number }): Promise<string> {
  const created = await c.post('/inspections', { type: input.type, vehicleUnitId: input.vehicleUnitId, contractId: input.contractId });
  ok(created, 201, `vistoria ${input.type}`);
  const id = created.data.id;
  ok(await c.patch(`/inspections/${id}`, { odometerKm: input.odometerKm, fuelEighths: input.fuelEighths ?? 8 }), 200, 'odômetro');
  const fileId = await uploadPhoto(c, 'Inspection', id);
  ok(await c.post(`/inspections/${id}/photos`, { fileId, region: 'front_bumper', caption: 'Frente' }), [200, 201], 'foto');
  ok(await c.post(`/inspections/${id}/complete`, { confirmationType: 'ACKNOWLEDGED_IN_PERSON', signerName: 'Cliente Aceite' }), [200, 201], 'concluir vistoria');
  return id;
}

let org: { id: string; slug: string; branchId: string } = { id: '', slug: '', branchId: '' };
let owner: Client;
let other: TestOrg;

before(async () => {
  await startApi();
  other = await createOrg();
});
after(stopApi);

describe('Aceitação — item 36', () => {
  const s: Record<string, any> = {};

  test('1. Master cria a empresa e o proprietário entra pelo link de senha', async () => {
    const email = await createPlatformUser('SUPER');
    const { CryptoService } = require('../dist/common/crypto.service');
    const secret = 'JBSWY3DPEHPK3PXP';
    await asPlatform((tx) => tx.user.update({ where: { email }, data: { mfaEnabled: true, mfaSecretEnc: new CryptoService().encrypt(secret) } }));
    const master = new Client('master');
    const step = await master.post('/auth/login', { email, password: PASSWORD });
    assert.equal(step.data.step, 'mfa');
    master.token = step.data.ticket;
    const mfa = await master.post('/auth/mfa', { code: totpCode(secret) });
    master.token = mfa.data.ticket;
    const sel = await master.post('/auth/context', { key: 'platform' });
    ok(sel, 200, 'contexto Master');
    master.token = sel.data.accessToken;

    const plans = await master.get('/platform/plans');
    const plan = (plans.data.items ?? plans.data).find((p: any) => p.code === 'rede');
    const slug = unique('locadora').toLowerCase();
    const ownerEmail = `dono@${slug}.test`;
    const created = await master.post('/platform/organizations', {
      name: `Locadora Aceite ${slug}`, slug, planId: plan.id, branchCode: 'MTZ', branchName: 'Matriz', ownerEmail, ownerName: 'Dona da Locadora',
    });
    ok(created, 201, 'criar empresa');
    assert.ok(created.data.accessLink, 'sem SMTP, o Master recebe o link do proprietário');
    owner = await acceptInvite(created.data.accessLink, ownerEmail);
    const session = await owner.get('/auth/session');
    assert.equal(session.data.context.organizationId, created.data.id);
    org = { id: created.data.id, slug, branchId: session.data.context.branches[0].id };
  });

  test('2. Proprietário cria filial, usuários com perfis, tarifa e serviço adicional', async () => {
    const branch = await owner.post('/branches', { code: 'FIL2', name: 'Filial Centro', city: 'Belo Horizonte', state: 'MG' });
    ok(branch, 201, 'filial');
    s.branch2 = branch.data.id;
    const roles = (await owner.get('/roles')).data as any[];
    const role = (k: string) => roles.find((r) => r.key === k).id;
    const invite = async (k: string) => {
      const email = `${k}-${randomUUID().slice(0, 6)}@${org.slug}.test`;
      const res = await owner.post('/members', { email, name: `Equipe ${k}`, roleId: role(k), allBranches: k === 'finance', branchIds: k === 'finance' ? [] : [org.branchId] });
      ok(res, 201, `convite ${k}`);
      return acceptInvite(res.data.accessLink, email);
    };
    s.agent = await invite('rental_agent');
    s.inspector = await invite('inspector');
    s.mechanic = await invite('mechanic');
    s.finance = await invite('finance');

    const categories = (await owner.get('/catalog/categories')).data;
    s.category = (categories.items ?? categories).find((c: any) => c.code === 'COMPACTO');
    ok(await owner.post('/pricing/rates', {
      categoryId: s.category.id, name: 'Compacto padrão', dailyRate: 150, weeklyRate: 900, includedKmPerDay: 200, extraKmRate: 1.2,
      additionalDriverDaily: 25, lateGraceMinutes: 60, depositAmount: 800,
    }), 201, 'tarifa');
    const extra = await owner.post('/pricing/extras', { name: 'Cadeirinha infantil', pricing: 'PER_DAY', price: 20 });
    ok(extra, 201, 'extra');
    s.extraId = extra.data.id;
  });

  test('3. Cadastra veículos, cliente PF e motorista', async () => {
    const models = (await owner.get('/catalog/models')).data;
    s.model = (models.items ?? models).find((m: any) => m.categoryId === s.category.id || m.category?.id === s.category.id);
    const vehicle = async () => {
      const res = await owner.post('/vehicles', {
        branchId: org.branchId, modelId: s.model.id, plate: fakePlate(), renavam: fakeRenavam(), chassis: fakeVin(),
        yearManufacture: 2024, yearModel: 2025, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', odometerKm: 10_000,
        acquiredAt: '2025-01-10', acquisitionValue: 85_000, tankCapacityLiters: 44,
      });
      ok(res, 201, 'veículo');
      return res.data;
    };
    s.car1 = await vehicle();
    s.car2 = await vehicle();
    const cpf = fakeCpf();
    s.customerEmail = `cliente-${cpf}@teste.test`;
    const customer = await s.agent.post('/customers', { type: 'PF', name: 'Cliente Aceite', document: cpf, email: s.customerEmail, phone: '31999990000' });
    ok(customer, 201, 'cliente');
    s.customer = customer.data;
    const asDriver = await s.agent.post(`/customers/${s.customer.id}/as-driver`, { cnhNumber: '12345678901', cnhCategory: 'B', cnhExpiresAt: iso(inDays(900)) });
    ok(asDriver, 201, 'cliente como motorista');
    s.driver1 = asDriver.data;
    const driver2 = await s.agent.post('/drivers', { customerId: s.customer.id, name: 'Segundo Condutor', cpf: fakeCpf(), cnhNumber: '10987654321', cnhCategory: 'B', cnhExpiresAt: iso(inDays(900)) });
    ok(driver2, 201, 'segundo motorista');
    s.driver2 = driver2.data;
  });

  test('4. Reserva com cotação do servidor; conflito recusado, inclusive simultâneo', async () => {
    s.start = inDays(1, 12);
    s.end = inDays(5, 12);
    const quote = await s.agent.post('/pricing/quote', { categoryId: s.category.id, branchId: org.branchId, startAt: iso(s.start), endAt: iso(s.end), extras: [{ extraServiceId: s.extraId, quantity: 1 }] });
    ok(quote, 200, 'cotação');
    assert.equal(quote.data.billableDays, 4);
    assert.equal(quote.data.total, 4 * 150 + 4 * 20);

    const reservation = await s.agent.post('/reservations', {
      customerId: s.customer.id, driverId: s.driver1.id, categoryId: s.category.id, branchId: org.branchId,
      startAt: iso(s.start), endAt: iso(s.end), extras: [{ extraServiceId: s.extraId, quantity: 1 }],
    });
    ok(reservation, 201, 'reserva');
    assert.equal(Number(reservation.data.total), quote.data.total, 'o total vem da cotação do servidor');
    ok(await s.agent.post(`/reservations/${reservation.data.id}/confirm`, { vehicleUnitId: s.car1.id }), [200, 201], 'confirmar');
    s.reservation = reservation.data;

    const conflicting = async () => {
      const r = await s.agent.post('/reservations', { customerId: s.customer.id, categoryId: s.category.id, branchId: org.branchId, startAt: iso(inDays(3, 12)), endAt: iso(inDays(6, 12)) });
      ok(r, 201, 'reserva concorrente');
      return r.data.id;
    };
    const r2 = await conflicting();
    assert.equal((await s.agent.post(`/reservations/${r2}/confirm`, { vehicleUnitId: s.car1.id })).status, 409);

    // Duas confirmações ao mesmo tempo do segundo carro no mesmo período: só uma passa.
    const [a, b] = [await conflicting(), await conflicting()];
    const results = await Promise.all([a, b].map((id) => s.agent.post(`/reservations/${id}/confirm`, { vehicleUnitId: s.car2.id })));
    assert.equal(results.filter((r) => r.status < 300).length, 1, JSON.stringify(results.map((r) => r.status)));
    assert.equal(results.filter((r) => r.status === 409).length, 1);
    const passed = results.find((r) => r.status < 300)!;
    const winner = [a, b][results.indexOf(passed)];
    // Libera o carro 2 para a troca de veículo mais adiante.
    ok(await s.agent.post(`/reservations/${winner}/cancel`, { reason: 'Teste de concorrência' }), [200, 201], 'cancelar');
  });

  test('5. Retirada: contrato, caução, vistoria de entrega com foto e ativação', async () => {
    const contract = await s.agent.post(`/reservations/${s.reservation.id}/checkout`, {});
    ok(contract, [200, 201], 'checkout');
    s.contract = contract.data;
    assert.equal(s.contract.status, 'APPROVED');

    const deposits = await s.agent.get(`/deposits?contractId=${s.contract.id}`);
    const deposit = (deposits.data.items ?? deposits.data)[0];
    assert.ok(deposit, 'caução criado com o contrato');
    ok(await s.agent.post(`/deposits/${deposit.id}/receipts`, { amount: 800, method: 'PIX', idempotencyKey: key() }), [200, 201], 'caução');
    s.depositId = deposit.id;

    // Sem vistoria de entrega, a entrega é recusada.
    assert.ok([409, 422].includes((await s.agent.post(`/contracts/${s.contract.id}/activate`, {})).status));
    s.deliveryInspection = await inspect(s.inspector, { type: 'DELIVERY', vehicleUnitId: s.car1.id, contractId: s.contract.id, odometerKm: 10_020 });
    ok(await s.agent.post(`/contracts/${s.contract.id}/activate`, {}), [200, 201], 'ativar');
    const detail = (await s.agent.get(`/contracts/${s.contract.id}`)).data;
    assert.equal(detail.status, 'ACTIVE');
    assert.equal(detail.vehicles[0].startKm, 10_020);
    assert.equal(detail.drivers.find((d: any) => !d.endAt).driverId ?? detail.drivers.find((d: any) => !d.endAt).driver.id, s.driver1.id);
  });

  test('6. Troca de motorista e de veículo preservando o histórico', async () => {
    s.swapDriverAt = new Date();
    ok(await s.agent.post(`/contracts/${s.contract.id}/swap-driver`, { driverId: s.driver2.id, reason: 'Cliente indicou outro condutor' }), [200, 201], 'trocar motorista');
    await inspect(s.inspector, { type: 'RETURN', vehicleUnitId: s.car1.id, contractId: s.contract.id, odometerKm: 10_150 });
    await inspect(s.inspector, { type: 'DELIVERY', vehicleUnitId: s.car2.id, contractId: s.contract.id, odometerKm: 10_000 });
    ok(await s.agent.post(`/contracts/${s.contract.id}/swap-vehicle`, { newVehicleUnitId: s.car2.id, reason: 'Pane elétrica' }), [200, 201], 'trocar veículo');
    s.swappedAt = Date.now();
    const detail = (await s.agent.get(`/contracts/${s.contract.id}`)).data;
    assert.equal(detail.drivers.length, 2);
    assert.equal(detail.drivers.filter((d: any) => !d.endAt).length, 1);
    assert.equal(detail.vehicles.length, 2);
    const closed = detail.vehicles.find((v: any) => v.endAt);
    assert.equal(closed.vehicleUnitId ?? closed.vehicle.id, s.car1.id);
    assert.equal(closed.endKm, 10_150);
    assert.ok(detail.vehicles.some((v: any) => !v.endAt && (v.vehicleUnitId ?? v.vehicle.id) === s.car2.id));
  });

  test('7. OS no veículo antigo consome peça do estoque', async () => {
    const cats = (await owner.get('/inventory/categories')).data;
    const category = (cats.items ?? cats).find((c: any) => c.name === 'Componentes elétricos');
    const product = await owner.post('/inventory/products', { sku: unique('BAT'), description: 'Bateria 60Ah', categoryId: category.id, unit: 'UN', minStock: 1 });
    ok(product, 201, 'produto');
    const locations = (await owner.get('/inventory/locations')).data;
    const location = (locations.items ?? locations).find((l: any) => l.branchId === org.branchId);
    ok(await owner.post('/inventory/movements', { productId: product.data.id, locationId: location.id, type: 'MANUAL_IN', quantity: 3, unitCost: 450, reason: 'Estoque inicial', idempotencyKey: key() }), 201, 'entrada');

    const types = (await owner.get('/maintenance/service-types')).data;
    const electric = (types.items ?? types).find((t: any) => t.name === 'Elétrica');
    const wo = await s.mechanic.post('/work-orders', { vehicleUnitId: s.car1.id, serviceTypeId: electric.id, kind: 'CORRECTIVE', description: 'Pane elétrica relatada na troca', blocksVehicle: false });
    ok(wo, 201, 'OS');
    s.workOrder = wo.data;
    ok(await s.mechanic.post(`/work-orders/${wo.data.id}/status`, { to: 'IN_PROGRESS' }), [200, 201], 'executar');
    ok(await s.mechanic.post(`/work-orders/${wo.data.id}/items`, { type: 'PART', productId: product.data.id, locationId: location.id, quantity: 1, idempotencyKey: key() }), [200, 201], 'peça');
    // Custo da peça exige aprovação: o proprietário aprova e conclui.
    ok(await owner.post(`/work-orders/${wo.data.id}/complete`, {}), [200, 201], 'concluir OS');
    const fresh = (await owner.get(`/inventory/products/${product.data.id}`)).data;
    const total = fresh.totalQuantity ?? fresh.quantity ?? fresh.balances?.reduce((a: number, b: any) => a + Number(b.quantity), 0);
    assert.equal(Number(total), 2);
    s.productId = product.data.id;
  });

  test('8. Infração com sugestão do condutor do período', async () => {
    // A infração acontece com o carro novo já no contrato e o segundo motorista ao volante.
    while (Date.now() - s.swappedAt < 1500) await new Promise((r) => setTimeout(r, 100));
    const res = await owner.post('/infractions', {
      autoNumber: unique('AIT'), authority: 'DETRAN-MG', description: 'Avançar sinal vermelho', occurredAt: iso(new Date(Date.now() - 500)),
      vehicleUnitId: s.car2.id, originalAmount: 293.47,
    });
    ok(res, 201, 'infração');
    s.infraction = res.data;
    const suggestion = await owner.get(`/infractions/${res.data.id}/driver-suggestion`);
    ok(suggestion, 200, 'sugestão');
    const suggested = suggestion.data.driver?.id ?? suggestion.data.driverId ?? suggestion.data.suggestion?.driver?.id;
    assert.equal(suggested, s.driver2.id, JSON.stringify(suggestion.data).slice(0, 600));
  });

  test('9. Cobrança e baixa idempotente', async () => {
    const list = await s.finance.get(`/receivables?contractId=${s.contract.id}`);
    const rental = (list.data.items as any[]).find((r) => r.kind === 'RENTAL');
    assert.ok(rental, 'título da locação gerado na ativação');
    const k = key();
    const body = { amount: Number(rental.amount), method: 'PIX', idempotencyKey: k, bankReference: 'E2E-ACEITE' };
    const [p1, p2] = [await s.finance.post(`/receivables/${rental.id}/payments`, body), await s.finance.post(`/receivables/${rental.id}/payments`, body)];
    ok(p1, [200, 201], 'baixa');
    ok(p2, [200, 201], 'baixa repetida');
    const payments = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${org.id}, true)`;
      return tx.payment.findMany({ where: { receivableId: rental.id } });
    });
    assert.equal(payments.length, 1, 'a mesma chave não duplica');
    assert.equal((await s.finance.get(`/receivables/${rental.id}`)).data.status, 'PAID');
  });

  test('10. Devolução com vistoria e acerto final', async () => {
    await inspect(s.inspector, { type: 'RETURN', vehicleUnitId: s.car2.id, contractId: s.contract.id, odometerKm: 10_400, fuelEighths: 6 });
    const close = await owner.post(`/contracts/${s.contract.id}/close`, { damages: [{ description: 'Risco no para-choque', amount: 180 }] });
    ok(close, [200, 201], 'encerrar');
    const detail = (await s.agent.get(`/contracts/${s.contract.id}`)).data;
    assert.equal(detail.status, 'CLOSED');
    assert.ok(detail.finalSettlement);
    const damages = (await s.finance.get(`/receivables?contractId=${s.contract.id}`)).data.items.filter((r: any) => r.kind === 'DAMAGE');
    assert.equal(damages.length, 1);
    const car = (await owner.get(`/vehicles/${s.car2.id}`)).data;
    assert.notEqual(car.commercialStatus, 'RENTED');
  });

  test('11. Histórico da placa reúne contrato, motoristas, vistorias, peça e infração', async () => {
    const t1 = (await owner.get(`/vehicles/${s.car1.id}/timeline?pageSize=100`)).data.items.map((i: any) => i.type);
    for (const type of ['CREATED', 'CONTRACT_STARTED', 'DRIVER_LINKED', 'INSPECTION', 'PART_USED', 'MAINTENANCE']) assert.ok(t1.includes(type), `carro 1 sem ${type}: ${t1}`);
    const t2 = (await owner.get(`/vehicles/${s.car2.id}/timeline?pageSize=100`)).data.items.map((i: any) => i.type);
    for (const type of ['CONTRACT_ENDED', 'INSPECTION', 'INFRACTION']) assert.ok(t2.includes(type), `carro 2 sem ${type}: ${t2}`);
    const t1all = (await owner.get(`/vehicles/${s.car1.id}/timeline?pageSize=100`)).data.items;
    assert.ok(t1all.some((i: any) => i.type === 'DRIVER_CHANGED' || i.type === 'DRIVER_LINKED'));
  });

  test('12. Rentabilidade do veículo com dados e lacunas declaradas', async () => {
    const res = await owner.get(`/profitability/${s.car1.id}`);
    ok(res, 200, 'rentabilidade');
    const r = res.data.result ?? res.data;
    assert.ok(Number(r.costs) > 0, JSON.stringify(res.data));
    const missing: string[] = r.missing ?? res.data.missing;
    assert.ok(missing.includes('Política de depreciação'));
    assert.ok(!missing.includes('Valor de aquisição'));
  });

  test('13. Portal do cliente: só os próprios contratos', async () => {
    const access = await s.agent.post(`/portal-access/customers/${s.customer.id}`);
    ok(access, [200, 201], 'acesso ao portal');
    const portal = await acceptInvite(access.data.accessLink, s.customerEmail);
    const contracts = await portal.get('/portal/contracts');
    ok(contracts, 200, 'contratos do portal');
    const ids = (contracts.data.items ?? contracts.data).map((c: any) => c.id);
    assert.deepEqual(ids, [s.contract.id]);

    // Outro cliente da mesma empresa, com contrato próprio.
    const cpf = fakeCpf();
    const otherCustomer = (await s.agent.post('/customers', { type: 'PF', name: 'Outro Cliente', document: cpf })).data;
    const otherDriver = (await s.agent.post(`/customers/${otherCustomer.id}/as-driver`, { cnhNumber: '55544433322', cnhCategory: 'B', cnhExpiresAt: iso(inDays(900)) })).data;
    const r = await s.agent.post('/reservations', { customerId: otherCustomer.id, driverId: otherDriver.id, categoryId: s.category.id, branchId: org.branchId, startAt: iso(inDays(20, 12)), endAt: iso(inDays(22, 12)), vehicleUnitId: s.car1.id, confirm: true });
    ok(r, 201, 'reserva do outro cliente');
    const otherContract = await s.agent.post(`/reservations/${r.data.id}/checkout`, {});
    ok(otherContract, [200, 201], 'contrato do outro cliente');
    assert.equal((await portal.get(`/portal/contracts/${otherContract.data.id}`)).status, 404);
    assert.ok([401, 403].includes((await portal.get('/vehicles')).status));
  });

  test('14. Site publicado e catálogo público sem placas', async () => {
    ok(await owner.put('/site', { brandName: 'Locadora Aceite', heroTitle: 'Alugue com tranquilidade' }), 200, 'site');
    ok(await owner.post('/site/publish', { published: true }), [200, 201], 'publicar');
    const site = await new Client().get(`/public/sites/${org.slug}`);
    ok(site, 200, 'site público');
    const models = await new Client().get(`/public/sites/${org.slug}/models?startAt=${encodeURIComponent(iso(inDays(30)))}&endAt=${encodeURIComponent(iso(inDays(32)))}`);
    ok(models, 200, 'catálogo');
    const text = JSON.stringify(models.data);
    assert.ok((models.data.items ?? models.data).length >= 1);
    assert.ok(!text.includes(s.car1.plate) && !text.includes(s.car2.plate), 'placas não aparecem');
    assert.ok(!text.includes(s.car1.id), 'id de unidade não aparece');
  });

  test('15. Isolamento: outra empresa não acessa nem enxerga', async () => {
    const intruder = new Client();
    await intruder.login(other.users.owner!);
    for (const path of [`/vehicles/${s.car1.id}`, `/contracts/${s.contract.id}`, `/customers/${s.customer.id}`, `/work-orders/${s.workOrder.id}`, `/infractions/${s.infraction.id}`]) {
      assert.ok([403, 404].includes((await intruder.get(path)).status), path);
    }
    const vehicles = (await intruder.get('/vehicles?pageSize=200')).data.items.map((v: any) => v.id);
    assert.ok(!vehicles.includes(s.car1.id));
    const search = await intruder.get(`/search?q=${encodeURIComponent(s.car1.plate)}`);
    ok(search, 200, 'busca');
    assert.equal(search.data.length, 0);
    assert.equal((await intruder.patch(`/vehicles/${s.car1.id}`, { color: 'Invadido' })).status, 404);
  });

  test('16. Foto da vistoria é baixada com os bytes da imagem', async () => {
    const inspection = (await owner.get(`/inspections/${s.deliveryInspection}`)).data;
    const photo = inspection.photos[0];
    const res = await owner.req('GET', `/files/${photo.fileId}/download`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^image\/png/);
    assert.ok(!String(res.data).startsWith('{'), 'o corpo é a imagem, não JSON');
  });
});
