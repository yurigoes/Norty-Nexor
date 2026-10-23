/**
 * Indicadores: relatórios (cenário 16), notificações e rotinas, busca
 * global (cenário 11), dashboard e Norty IA.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client, startApi, stopApi } from './helpers';
import { asPlatform, createOrg, db, type TestOrg } from './db';
import { createCustomerAndDriver, createVehicle } from './fixtures-insights';

let A: TestOrg;
const owner = new Client('owner');
const manager = new Client('branch_manager');
const viewer = new Client('viewer');
const mechanic = new Client('mechanic');

before(async () => {
  await startApi();
  A = await createOrg();
  await owner.login(A.users.owner!);
  await manager.login(A.users.branch_manager!);
  await viewer.login(A.users.viewer!);
  await mechanic.login(A.users.mechanic!);
});
after(stopApi);

const dist = (p: string) => require(resolve(__dirname, '../dist', p));

describe('Dashboard', () => {
  test('empresa nova devolve zeros e listas vazias', async () => {
    const fresh = await createOrg();
    const c = new Client();
    await c.login(fresh.users.owner!);
    const res = await c.get('/dashboard');
    assert.equal(res.status, 200);
    assert.equal(res.data.fleet.total, 0);
    assert.equal(res.data.fleet.occupancyRate, null);
    assert.equal(res.data.rentals.activeContracts, 0);
    assert.deepEqual(res.data.rentals.expiring, []);
    assert.equal(res.data.finance.revenue, 0);
    assert.equal(res.data.finance.received, 0);
    assert.equal(res.data.finance.delinquencyRate, null);
    assert.equal(res.data.deposits.held, 0);
    assert.equal(res.data.inventory.critical, 0);
    assert.deepEqual(res.data.vehicles.mostProfitable, []);
  });

  test('blocos seguem as permissões: mecânico não recebe financeiro', async () => {
    const res = await mechanic.get('/dashboard');
    // Mecânico não tem dashboard.view.
    assert.equal(res.status, 403);
    const m = await manager.get('/dashboard');
    assert.equal(m.status, 200);
    assert.ok(m.data.fleet);
    assert.equal(m.data.vehicles, undefined);
  });

  test('filtro por filial não autorizada é recusado', async () => {
    const res = await manager.get(`/dashboard?branchId=${A.branch2Id}`);
    assert.equal(res.status, 403);
  });
});

describe('Relatórios', () => {
  test('catálogo traz os 25 relatórios para o proprietário e filtra para perfis menores', async () => {
    const all = await owner.get('/reports');
    assert.equal(all.data.length, 25);
    const limited = await manager.get('/reports');
    assert.ok(limited.data.length < 25);
    assert.ok(!limited.data.some((r: { financial: boolean }) => r.financial));
  });

  test('relatório financeiro negado a perfil sem reports.financial', async () => {
    const res = await manager.get('/reports/revenue');
    assert.equal(res.status, 403);
    assert.equal((await owner.get('/reports/revenue')).status, 200);
  });

  test('exportar exige reports.export e gera CSV com BOM e separador ;', async () => {
    const denied = await viewer.get('/reports/fleet/export?format=csv');
    assert.equal(denied.status, 403);
    await createVehicle(A.id, A.branchId);
    const base = await startApi();
    // Bytes crus: res.text() descartaria o BOM que o Excel precisa.
    const raw = await fetch(`${base}/reports/fleet/export?format=csv`, { headers: { Authorization: `Bearer ${owner.token}` } });
    assert.equal(raw.status, 200);
    const bytes = Buffer.from(await raw.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = bytes.subarray(3).toString('utf8');
    assert.match(text.split('\r\n')[0]!, /^Código;Placa;Modelo/);
    const audit = await asPlatform((tx) => tx.auditLog.findFirst({ where: { organizationId: A.id, action: 'report.exported' } }));
    assert.ok(audit);
  });

  test('relatório respeita filial: gerente não vê veículo da filial 2', async () => {
    const own = await createVehicle(A.id, A.branchId);
    const otherBranch = await createVehicle(A.id, A.branch2Id);
    const res = await manager.get('/reports/fleet?pageSize=200');
    assert.equal(res.status, 200);
    const plates = res.data.items.map((r: { plate: string }) => r.plate.replace('-', ''));
    assert.ok(plates.includes(own.plate));
    assert.ok(!plates.includes(otherBranch.plate));
    const full = await owner.get('/reports/fleet?pageSize=200');
    assert.ok(full.data.items.some((r: { plate: string }) => r.plate.replace('-', '') === otherBranch.plate));
  });

  test('filtro obrigatório e valor fora da lista são validados', async () => {
    assert.equal((await owner.get('/reports/plate-history')).status, 400);
    assert.equal((await owner.get('/reports/fleet?commercialStatus=INVENTADO')).status, 400);
  });

  test('rentabilidade não inventa dado ausente', async () => {
    await createVehicle(A.id, A.branchId);
    const res = await owner.get('/profitability');
    assert.equal(res.status, 200);
    const row = res.data.vehicles[0];
    assert.equal(row.depreciation, null);
    assert.ok(row.missing.includes('Política de depreciação'));
    assert.equal((await manager.get('/profitability')).status, 403);
  });
});

describe('Notificações e rotinas', () => {
  test('rotina rodada duas vezes não duplica; só a audiência vê', async () => {
    const { runJobsForOrganization, ALERT_JOBS } = dist('modules/notifications/alert-jobs');
    const { NotifyService } = dist('common/notify.service');
    const { orgSettings } = dist('common/org-settings');
    const { driver } = await createCustomerAndDriver(A.id, new Date(Date.now() + 5 * 86_400_000));
    const run = () => db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${A.id}, true)`;
      return runJobsForOrganization(tx, A.id, { notify: new NotifyService(), now: new Date(), settings: orgSettings({}) }, ALERT_JOBS);
    });
    const first = await run();
    assert.ok(first['alerts.cnh'] >= 1);
    const second = await run();
    assert.equal(second['alerts.cnh'], 0);
    const rows = await asPlatform((tx) => tx.notification.findMany({ where: { organizationId: A.id, dedupeKey: { startsWith: `cnh:${driver.id}` } } }));
    assert.equal(rows.length, 1);

    // Proprietário (customers.view) vê; mecânico (sem customers.view) não.
    const ownerList = await owner.get('/notifications?pageSize=200');
    assert.ok(ownerList.data.items.some((n: { id: string }) => n.id === rows[0].id));
    const mechList = await mechanic.get('/notifications?pageSize=200');
    assert.ok(!mechList.data.items.some((n: { id: string }) => n.id === rows[0].id));
    assert.equal((await mechanic.post(`/notifications/${rows[0].id}/read`)).status, 404);

    const before = (await owner.get('/notifications/unread-count')).data.unread;
    assert.equal((await owner.post(`/notifications/${rows[0].id}/read`)).status, 204);
    const afterRead = (await owner.get('/notifications/unread-count')).data.unread;
    assert.equal(afterRead, before - 1);
  });

  test('notificação de outra filial não aparece para o gerente da filial 1', async () => {
    const { NotifyService } = dist('common/notify.service');
    const key = `teste-filial-${Date.now()}`;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${A.id}, true)`;
      await new NotifyService().notify(tx, A.id, { type: 'teste', title: 'Filial 2', body: 'Somente filial 2', audiencePermission: 'fleet.view', branchId: A.branch2Id, dedupeKey: key });
    });
    const list = await manager.get('/notifications?pageSize=200');
    assert.ok(!list.data.items.some((n: { dedupeKey: string }) => n.dedupeKey === key));
    const ownerList = await owner.get('/notifications?pageSize=200');
    assert.ok(ownerList.data.items.some((n: { dedupeKey: string }) => n.dedupeKey === key));
  });

  test('outbox: canal sem configuração não é simulado', async () => {
    const n = await asPlatform((tx) => tx.notification.create({ data: { organizationId: A.id, type: 'teste', title: 'E-mail', body: 'Corpo', dedupeKey: `outbox-${Date.now()}` } }));
    const d = await asPlatform((tx) => tx.notificationDelivery.create({ data: { organizationId: A.id, notificationId: n.id, channel: 'EMAIL', target: 'alguem@teste.test' } }));
    const { OutboxService } = dist('modules/notifications/outbox.service');
    const { MailService } = dist('common/mail.service');
    const { CryptoService } = dist('common/crypto.service');
    const { PrismaService } = dist('common/prisma.service');
    const prisma = new PrismaService();
    const outbox = new OutboxService(prisma, new MailService(), new CryptoService());
    await outbox.processDue();
    await prisma.$disconnect();
    const after = await asPlatform((tx) => tx.notificationDelivery.findUnique({ where: { id: d.id } }));
    assert.equal(after.status, 'SKIPPED_NOT_CONFIGURED');
  });
});

describe('Busca global', () => {
  test('não retorna registro de outra empresa nem de filial não autorizada', async () => {
    const v1 = await createVehicle(A.id, A.branchId);
    const v2 = await createVehicle(A.id, A.branch2Id);
    const B = await createOrg();
    const other = new Client();
    await other.login(B.users.owner!);

    const own = await owner.get(`/search?q=${v2.plate}`);
    assert.ok(own.data.some((h: { id: string }) => h.id === v2.id));
    const fromB = await other.get(`/search?q=${v1.plate}`);
    assert.equal(fromB.status, 200);
    assert.ok(!fromB.data.some((h: { id: string }) => h.id === v1.id));
    const branchOnly = await manager.get(`/search?q=${v2.plate}`);
    assert.ok(!branchOnly.data.some((h: { id: string }) => h.id === v2.id));
    const branchOk = await manager.get(`/search?q=${v1.plate}`);
    assert.ok(branchOk.data.some((h: { id: string }) => h.id === v1.id));
  });

  test('tipos sem permissão ficam de fora', async () => {
    const { customer } = await createCustomerAndDriver(A.id);
    const res = await mechanic.get(`/search?q=${encodeURIComponent(customer.name)}`);
    assert.equal(res.status, 200);
    assert.ok(!res.data.some((h: { type: string }) => h.type === 'customer'));
  });
});

describe('Norty IA', () => {
  test('sem chave configurada: status claro e 503 not_configured, sem resposta simulada', async () => {
    const status = await owner.get('/ai/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.configured, false);
    const ask = await owner.post('/ai/ask', { question: 'Quais contas estão vencidas?' });
    assert.equal(ask.status, 503);
    assert.equal(ask.data.code, 'not_configured');
    assert.equal((await mechanic.post('/ai/ask', { question: 'Oi' })).status, 403);
  });
});
