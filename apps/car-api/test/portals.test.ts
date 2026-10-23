/**
 * Grupo E: Master Norty, acesso de suporte, portal do cliente, site
 * público, domínios e API de integração.
 * Cenários 11, 12, 13 e 18 das regras obrigatórias.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Client, PASSWORD, fakeCpf, fakePlate, fakeRenavam, fakeVin, inDays, startApi, stopApi, unique } from './helpers';
import { asPlatform, createOrg, createPlatformUser, type TestOrg } from './db';
import { totpCode } from '../src/common/totp';

let A: TestOrg;
let B: TestOrg;
const SECRET = 'JBSWY3DPEHPK3PXP';

/** Usuário da equipe Norty com MFA ativo, já no contexto PLATFORM. */
async function platformClient(role: 'SUPPORT' | 'ADMIN' | 'SUPER'): Promise<{ client: Client; email: string }> {
  const email = await createPlatformUser(role);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CryptoService } = require('../dist/common/crypto.service');
  await asPlatform((tx) => tx.user.update({ where: { email }, data: { mfaEnabled: true, mfaSecretEnc: new CryptoService().encrypt(SECRET) } }));
  const client = await mfaLogin(email);
  const ctx = await client.post('/auth/context', { key: 'platform' });
  assert.equal(ctx.status, 200);
  client.token = ctx.data.accessToken;
  return { client, email };
}

async function mfaLogin(email: string): Promise<Client> {
  const client = new Client();
  const step = await client.post('/auth/login', { email, password: PASSWORD });
  client.token = step.data.ticket;
  const s2 = await client.post('/auth/mfa', { code: totpCode(SECRET) });
  assert.equal(s2.status, 200, JSON.stringify(s2.data));
  client.token = s2.data.ticket;
  return client;
}

async function staff(org: TestOrg, role = 'owner'): Promise<Client> {
  const c = new Client();
  const r = await c.login(org.users[role]!, (x) => x.organizationId === org.id);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return c;
}

/** Cliente com contrato, direto no banco (o fluxo de contratos é de outro grupo). */
async function customerWithContract(org: TestOrg, label: string) {
  return asPlatform(async (tx) => {
    const category = await tx.vehicleCategory.findFirstOrThrow({ where: { organizationId: org.id } });
    const model = await tx.vehicleModel.findFirstOrThrow({ where: { organizationId: org.id, categoryId: category.id } });
    const vehicle = await tx.vehicleUnit.create({
      data: {
        organizationId: org.id, branchId: org.branchId, modelId: model.id, categoryId: category.id, internalCode: unique('V'),
        plate: fakePlate(), renavam: fakeRenavam(), chassis: fakeVin(), yearManufacture: 2024, yearModel: 2025, color: 'Prata',
        fuel: 'FLEX', transmission: 'MANUAL',
      },
    });
    const email = `${unique(label)}@cliente.test`;
    const customer = await tx.customer.create({ data: { organizationId: org.id, type: 'PF', name: `Cliente ${label}`, document: fakeCpf(), email } });
    const contract = await tx.rentalContract.create({
      data: {
        organizationId: org.id, branchId: org.branchId, number: unique('CTR'), kind: 'LONG_TERM', status: 'ACTIVE', customerId: customer.id,
        startAt: inDays(-10), endAt: inDays(300), monthlyAmount: 2500, termMonths: 12, billingDay: 10,
      },
    });
    await tx.contractVehicle.create({ data: { organizationId: org.id, contractId: contract.id, vehicleUnitId: vehicle.id, startAt: inDays(-10) } });
    await tx.receivable.create({
      data: { organizationId: org.id, branchId: org.branchId, customerId: customer.id, contractId: contract.id, kind: 'MONTHLY', description: 'Mensalidade', amount: 2500, dueDate: inDays(5), competence: unique('2026') },
    });
    return { customer, contract, vehicle, email };
  });
}

before(async () => {
  await startApi();
  A = await createOrg();
  B = await createOrg();
});
after(stopApi);

describe('Master Norty', () => {
  test('cria empresa com plano e proprietário, que entra e opera', async () => {
    const { client } = await platformClient('SUPER');
    const plans = await client.get('/platform/plans');
    const plan = plans.data.find((p: any) => p.code === 'profissional');
    const slug = unique('nova');
    const ownerEmail = `${unique('dono')}@nova.test`;
    const res = await client.post('/platform/organizations', {
      name: 'Locadora Nova de Teste', slug, planId: plan.id, trialDays: 14, branchCode: 'MTZ', branchName: 'Matriz', ownerEmail, ownerName: 'Dono Teste',
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.emailStatus, 'NOT_CONFIGURED');
    const token = decodeURIComponent(res.data.accessLink.split('token=')[1]);
    assert.equal((await new Client().post('/auth/password/reset', { token, newPassword: 'DonoNovo#2026' })).status, 204);
    const owner = new Client();
    assert.equal((await owner.login(ownerEmail, undefined, 'DonoNovo#2026')).status, 200);
    const branches = await owner.get('/branches');
    assert.equal(branches.status, 200);
    assert.equal(branches.data.length, 1);
    const detail = await client.get(`/platform/organizations/${res.data.id}`);
    assert.equal(detail.data.usage.users, 1);
    assert.ok(detail.data.history.some((h: any) => h.action === 'platform.organization_created'));
  });

  test('contexto PLATFORM não lê dados operacionais', async () => {
    const { client } = await platformClient('SUPER');
    for (const path of ['/branches', '/members', '/organization', '/pricing/rates', '/audit']) {
      assert.equal((await client.get(path)).status, 403, path);
    }
  });

  test('equipe da empresa não acessa o Master', async () => {
    const c = await staff(A);
    assert.equal((await c.get('/platform/dashboard')).status, 403);
  });

  test('suspender bloqueia a equipe na requisição seguinte; reativar libera', async () => {
    const org = await createOrg();
    const { client } = await platformClient('ADMIN');
    const c = await staff(org);
    assert.equal((await c.get('/branches')).status, 200);
    assert.equal((await client.post(`/platform/organizations/${org.id}/status`, { status: 'SUSPENDED', reason: 'abc' })).status, 400);
    assert.equal((await client.post(`/platform/organizations/${org.id}/status`, { status: 'SUSPENDED', reason: 'Inadimplência de teste' })).status, 200);
    const blocked = await c.get('/branches');
    assert.equal(blocked.status, 403);
    assert.match(blocked.data.message, /suspensa/);
    assert.equal((await client.post(`/platform/organizations/${org.id}/status`, { status: 'ACTIVE', reason: 'Regularizada' })).status, 200);
    assert.equal((await c.get('/branches')).status, 200);
  });

  test('faturas SaaS: geração idempotente e baixa manual', async () => {
    const { client } = await platformClient('ADMIN');
    const plans = (await client.get('/platform/plans')).data;
    await client.patch(`/platform/plans/${plans.find((p: any) => p.code === 'rede').id}`, { priceMonthly: 990 });
    await asPlatform((tx) => tx.subscription.updateMany({ where: { organizationId: A.id }, data: { status: 'ACTIVE' } }));
    const competence = `20${30 + Math.floor(Math.random() * 60)}-0${1 + Math.floor(Math.random() * 9)}`;
    const first = await client.post('/platform/invoices/generate', { competence, dueDay: 10 });
    const second = await client.post('/platform/invoices/generate', { competence, dueDay: 10 });
    assert.ok(first.data.created >= 1);
    assert.equal(second.data.created, 0);
    const invoice = await asPlatform((tx) => tx.saasInvoice.findFirst({ where: { organizationId: A.id, competence } }));
    assert.equal(Number(invoice.amount), 990);
    assert.equal((await client.post(`/platform/invoices/${invoice.id}/pay`, { reference: 'TED 123' })).status, 200);
    assert.equal((await client.post(`/platform/invoices/${invoice.id}/pay`, { reference: 'TED 123' })).status, 409);
  });
});

describe('Acesso excepcional de suporte', () => {
  test('pedido → autorização da empresa → leitura → escrita negada → revogação', async () => {
    const { client: support, email } = await platformClient('SUPPORT');
    const denied = await support.post('/platform/support-grants', { organizationId: A.id, purpose: 'Investigar erro relatado no chamado', scope: ['users.manage'], durationHours: 4 });
    assert.equal(denied.status, 400);
    const req = await support.post('/platform/support-grants', { organizationId: A.id, purpose: 'Investigar erro relatado no chamado', scope: ['fleet.view', 'dashboard.view'], durationHours: 4 });
    assert.equal(req.status, 201);
    // Antes da autorização, o contexto não existe.
    const pre = await mfaLogin(email);
    const before = await pre.get('/auth/contexts');
    assert.ok(!before.data.some((c: any) => c.kind === 'SUPPORT'));

    const owner = await staff(A);
    assert.equal((await owner.post(`/support/grants/${req.data.id}/approve`, {})).status, 201);

    const s = await mfaLogin(email);
    const contexts = (await s.get('/auth/contexts')).data;
    const ctx = contexts.find((c: any) => c.kind === 'SUPPORT' && c.organizationId === A.id);
    assert.ok(ctx);
    s.token = (await s.post('/auth/context', { key: ctx.key })).data.accessToken;
    assert.equal((await s.get('/branches')).status, 200);
    assert.equal((await s.post('/branches', { code: 'SUP1', name: 'Invasão' })).status, 403);
    const audit = await owner.get('/audit?action=support.');
    assert.ok(audit.data.items.some((i: any) => i.action === 'support.session_started'));

    assert.equal((await owner.post(`/support/grants/${req.data.id}/revoke`, { note: 'Fim da análise' })).status, 201);
    const after = await s.get('/branches');
    assert.ok([401, 403].includes(after.status));
  });
});

describe('Portal do cliente', () => {
  test('cliente entra, vê só os próprios contratos e não alcança outra empresa', async () => {
    const mine = await customerWithContract(A, 'meu');
    const other = await customerWithContract(A, 'outro');
    const foreign = await customerWithContract(B, 'fora');
    const owner = await staff(A);
    const agent = await staff(A, 'viewer');
    assert.equal((await agent.post(`/portal-access/customers/${mine.customer.id}`)).status, 403);
    const access = await owner.post(`/portal-access/customers/${mine.customer.id}`);
    assert.equal(access.status, 201, JSON.stringify(access.data));
    assert.equal(access.data.isNewUser, true);
    const token = decodeURIComponent(access.data.accessLink.split('token=')[1]);
    await new Client().post('/auth/password/reset', { token, newPassword: 'Cliente#Teste2026' });

    const client = new Client();
    assert.equal((await client.login(mine.email, undefined, 'Cliente#Teste2026')).status, 200);
    const contracts = await client.get('/portal/contracts');
    assert.deepEqual(contracts.data.map((c: any) => c.id), [mine.contract.id]);
    assert.ok(!JSON.stringify(contracts.data).includes(mine.vehicle.id));
    assert.equal((await client.get(`/portal/contracts/${other.contract.id}`)).status, 404);
    assert.equal((await client.get(`/portal/contracts/${foreign.contract.id}`)).status, 404);
    assert.equal((await client.get(`/portal/contracts/${mine.contract.id}`)).status, 200);
    // Cliente não entra na área da equipe.
    assert.equal((await client.get('/branches')).status, 403);
    const finance = await client.get('/portal/finance');
    assert.equal(finance.data.titles.length, 1);

    const reqRes = await client.post('/portal/requests', { type: 'DATA_CORRECTION', subject: 'Corrigir telefone', description: 'Meu telefone mudou.' });
    assert.equal(reqRes.status, 201);
    const list = await owner.get('/service-requests');
    assert.ok(list.data.some((r: any) => r.id === reqRes.data.id));
    assert.equal((await owner.post(`/service-requests/${reqRes.data.id}/messages`, { body: 'Atualizado.', close: true })).status, 201);

    assert.equal((await owner.del(`/portal-access/customers/${mine.customer.id}`, {})).status, 204);
    assert.ok([401, 403].includes((await client.get('/portal/contracts')).status));
  });
});

describe('Site público e domínios', () => {
  test('site despublicado é 404; publicado mostra catálogo sem placa nem id de unidade', async () => {
    const org = await createOrg();
    const pub = new Client();
    assert.equal((await pub.get(`/public/sites/${org.slug}`)).status, 404);
    const owner = await staff(org);
    const { vehicle } = await customerWithContract(org, 'site');
    const freePlate = await asPlatform(async (tx) => {
      const v = await tx.vehicleUnit.create({
        data: { ...pick(vehicle), internalCode: unique('V'), plate: fakePlate(), renavam: fakeRenavam(), chassis: fakeVin() },
      });
      return v.plate;
    });
    assert.equal((await owner.req('PUT', '/site', { brandName: 'Locadora Site', heroTitle: 'Alugue' })).status, 200);
    assert.equal((await owner.post('/site/publish', { published: true })).status, 200);
    const home = await pub.get(`/public/sites/${org.slug}`);
    assert.equal(home.status, 200);
    const models = await pub.get(`/public/sites/${org.slug}/models?startAt=${inDays(400).toISOString()}&endAt=${inDays(403).toISOString()}`);
    assert.equal(models.status, 200);
    const text = JSON.stringify(models.data);
    assert.ok(!text.includes(vehicle.plate) && !text.includes(freePlate));
    assert.ok(!text.includes(vehicle.id));
    const withFleet = models.data.find((m: any) => m.fleetSize);
    assert.equal(withFleet.available, true);

    const noConsent = await pub.post(`/public/sites/${org.slug}/leads`, { kind: 'CONTACT', name: 'Visitante', email: 'visitante@teste.test', consent: false });
    assert.equal(noConsent.status, 400);
    const ok = await pub.post(`/public/sites/${org.slug}/leads`, { kind: 'CONTACT', name: 'Visitante', email: 'visitante@teste.test', consent: true });
    assert.equal(ok.status, 202);
    const leads = await owner.get('/leads');
    assert.equal(leads.data.total, 1);
    // Honeypot: responde igual, não grava.
    await pub.post(`/public/sites/${org.slug}/leads`, { kind: 'CONTACT', name: 'Robô', email: 'r@b.test', consent: true, website: 'spam' });
    assert.equal((await owner.get('/leads')).data.total, 1);

    assert.equal((await owner.post('/site/publish', { published: false })).status, 200);
    assert.equal((await pub.get(`/public/sites/${org.slug}`)).status, 404);
  });

  test('hostname é único na plataforma e o host resolve só a empresa dona', async () => {
    const host = `www.${unique('loc')}.com.br`;
    const a = await staff(A);
    const b = await staff(B);
    const created = await a.post('/domains', { hostname: `https://${host}/` });
    assert.equal(created.status, 201);
    assert.equal(created.data.hostname, host);
    assert.equal(created.data.status, 'PENDING_VERIFICATION');
    assert.match(created.data.instructions.txt.name, /^_nortycar-verify\./);
    assert.equal((await b.post('/domains', { hostname: host })).status, 409);
    // B não enxerga nem remove o domínio de A.
    assert.ok(!(await b.get('/domains')).data.some((d: any) => d.hostname === host));
    assert.equal((await b.req('DELETE', `/domains/${created.data.id}`, { reason: 'tentativa' })).status, 404);

    const pub = new Client();
    assert.equal((await pub.get(`/public/domains/tls-ask?domain=${host}`)).status, 404);
    assert.equal((await pub.get(`/public/sites/resolve?host=${host}`)).status, 404);
    await asPlatform((tx) => tx.domain.update({ where: { hostname: host }, data: { status: 'ACTIVE', verifiedAt: new Date() } }));
    assert.equal((await pub.get(`/public/domains/tls-ask?domain=${host}`)).status, 200);
    await a.req('PUT', '/site', { brandName: 'Site A' });
    await a.post('/site/publish', { published: true });
    const resolved = await pub.get(`/public/sites/resolve?host=${host}`);
    assert.equal(resolved.data.slug, A.slug);
    assert.equal((await pub.get(`/public/domains/tls-ask?domain=inexistente.test`)).status, 404);
  });
});

describe('Integrações', () => {
  test('chave de API lê só a própria empresa; revogada → 401', async () => {
    const a = await staff(A);
    await customerWithContract(A, 'api');
    const { vehicle: bVehicle } = await customerWithContract(B, 'apib');
    const viewer = await staff(A, 'viewer');
    assert.equal((await viewer.post('/integrations/api-keys', { name: 'x', scopes: ['vehicles:read'] })).status, 403);
    const created = await a.post('/integrations/api-keys', { name: 'ERP', scopes: ['vehicles:read'] });
    assert.equal(created.status, 201);
    assert.match(created.data.key, /^nc_live_/);
    const listed = await a.get('/integrations/api-keys');
    assert.ok(!JSON.stringify(listed.data).includes(created.data.key));
    assert.ok(!('keyHash' in listed.data[0]));

    const api = new Client();
    const auth = { Authorization: `ApiKey ${created.data.key}` };
    const res = await api.req('GET', '/integration/vehicles', undefined, auth);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(res.data.items.length >= 1);
    assert.ok(!res.data.items.some((v: any) => v.id === bVehicle.id));
    assert.ok(!('acquisitionValue' in res.data.items[0]));
    assert.equal((await api.req('GET', '/integration/reservations', undefined, auth)).status, 403);
    assert.equal((await api.req('GET', '/integration/vehicles', undefined, { Authorization: `ApiKey ${created.data.key.slice(0, -1)}x` })).status, 401);
    assert.equal((await a.del(`/integrations/api-keys/${created.data.id}`)).status, 204);
    assert.equal((await api.req('GET', '/integration/vehicles', undefined, auth)).status, 401);
  });

  test('segredo do webhook só aparece na criação e o teste de entrega é real e assinado', async () => {
    const received: { body: string; signature: string }[] = [];
    const server: Server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { received.push({ body, signature: String(req.headers['x-nortycar-signature']) }); res.writeHead(204).end(); });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;
    try {
      const a = await staff(A);
      const created = await a.post('/integrations/webhooks', { url: `http://127.0.0.1:${port}/hook`, events: ['*'] });
      assert.equal(created.status, 201);
      assert.match(created.data.secret, /^whsec_/);
      const list = await a.get('/integrations/webhooks');
      assert.ok(!JSON.stringify(list.data).includes(created.data.secret));
      assert.ok(!('secretEnc' in list.data[0]));
      const test1 = await a.post(`/integrations/webhooks/${created.data.id}/test`);
      assert.equal(test1.data.ok, true);
      const expected = `sha256=${createHmac('sha256', created.data.secret).update(received[0]!.body).digest('hex')}`;
      assert.equal(received[0]!.signature, expected);
      // Destino fora do ar é falha, não sucesso.
      await a.patch(`/integrations/webhooks/${created.data.id}`, { url: 'http://127.0.0.1:1/nada' });
      const test2 = await a.post(`/integrations/webhooks/${created.data.id}/test`);
      assert.equal(test2.data.ok, false);
    } finally {
      server.close();
    }
  });
});

function pick(v: any) {
  const { organizationId, branchId, modelId, categoryId, yearManufacture, yearModel, color, fuel, transmission } = v;
  return { organizationId, branchId, modelId, categoryId, yearManufacture, yearModel, color, fuel, transmission };
}
