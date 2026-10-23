/**
 * Fundação: RLS, isolamento multiempresa, autenticação, contexto e permissões.
 * Cenários 11, 13, 16 e 18 das regras obrigatórias.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PASSWORD, startApi, stopApi } from './helpers';
import { asPlatform, createOrg, createPlatformUser, db, type TestOrg } from './db';
import { totpCode } from '../src/common/totp';

let A: TestOrg;
let B: TestOrg;

before(async () => {
  await startApi();
  A = await createOrg();
  B = await createOrg();
});
after(stopApi);

describe('Row-Level Security', () => {
  test('toda tabela com organizationId tem RLS forçado (exceto as de plataforma)', async () => {
    const rows = await db.$queryRaw<{ table_name: string; rls: boolean; forced: boolean }[]>`
      SELECT c.table_name, t.relrowsecurity AS rls, t.relforcerowsecurity AS forced
        FROM information_schema.columns c
        JOIN pg_class t ON t.relname = c.table_name
       WHERE c.table_schema = 'public' AND c.column_name = 'organizationId'`;
    const platform = new Set(['subscriptions', 'saas_invoices', 'domains', 'support_access_grants', 'support_tickets', 'inbound_webhook_events']);
    const missing = rows.filter((r) => !platform.has(r.table_name) && !(r.rls && r.forced)).map((r) => r.table_name);
    assert.deepEqual(missing, [], `Tabelas sem RLS: ${missing.join(', ')}`);
    assert.ok(rows.length > 60);
  });

  test('uma transação da empresa A não enxerga dados da empresa B, mesmo sem where', async () => {
    const seen = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${A.id}, true)`;
      return tx.branch.findMany();
    });
    assert.ok(seen.length >= 2);
    assert.ok(seen.every((b) => b.organizationId === A.id));
  });

  test('sem contexto declarado, nenhuma linha de empresa é visível', async () => {
    const seen = await db.vehicleCategory.findMany();
    assert.equal(seen.length, 0);
  });

  test('não é possível gravar linha de outra empresa dentro do contexto de A', async () => {
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${A.id}, true)`;
      await tx.costCenter.create({ data: { organizationId: B.id, code: 'X', name: 'Invasão' } });
    }), /row-level security/);
  });

  test('trilha de auditoria é imutável', async () => {
    const log = await asPlatform((tx) => tx.auditLog.create({ data: { actorType: 'SYSTEM', action: 'teste', entityType: 'Teste' } }));
    await assert.rejects(asPlatform((tx) => tx.auditLog.update({ where: { id: log.id }, data: { action: 'adulterado' } })), /imutável/);
    await assert.rejects(asPlatform((tx) => tx.auditLog.delete({ where: { id: log.id } })), /imutável/);
  });
});

describe('Autenticação', () => {
  test('mensagem idêntica para e-mail inexistente e senha errada', async () => {
    const c = new Client();
    const a = await c.post('/auth/login', { email: 'ninguem@inexistente.test', password: 'qualquer-coisa1' });
    const b = await c.post('/auth/login', { email: A.users.viewer, password: 'senha-errada-1' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.data.message, b.data.message);
  });

  test('bloqueio progressivo após 5 senhas erradas', async () => {
    const email = A.users.mechanic!;
    const c = new Client();
    for (let i = 0; i < 5; i += 1) await c.post('/auth/login', { email, password: 'errada-123456' });
    const blocked = await c.post('/auth/login', { email, password: PASSWORD });
    assert.equal(blocked.status, 429);
    await asPlatform((tx) => tx.user.update({ where: { email }, data: { lockedUntil: null, failedLogins: 0 } }));
    const ok = await c.login(email);
    assert.equal(ok.status, 200);
  });

  test('refresh rotaciona o token: o anterior deixa de valer', async () => {
    const c = new Client();
    await c.login(A.users.owner!);
    const old = c.cookie;
    const r1 = await c.post('/auth/refresh');
    assert.equal(r1.status, 200);
    assert.notEqual(c.cookie, old);
    const replay = new Client();
    replay.cookie = old;
    const r2 = await replay.post('/auth/refresh');
    assert.equal(r2.status, 401);
  });

  test('logout encerra a sessão na hora', async () => {
    const c = new Client();
    await c.login(A.users.owner!);
    assert.equal((await c.get('/auth/session')).status, 200);
    await c.post('/auth/logout');
    assert.equal((await c.get('/auth/session')).status, 401);
  });

  test('usuário em duas empresas escolhe o contexto e troca sem novo login', async () => {
    const email = A.users.rental_agent!;
    await asPlatform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { email } });
      await tx.membership.create({ data: { organizationId: B.id, userId: user.id, roleId: B.roles.viewer, allBranches: true } });
    });
    const c = new Client();
    const step = await c.post('/auth/login', { email, password: PASSWORD });
    assert.equal(step.data.step, 'context');
    assert.equal(step.data.contexts.length, 2);
    // Ticket não dá acesso a dado nenhum.
    c.token = step.data.ticket;
    assert.equal((await c.get('/branches')).status, 401);
    const ctxA = step.data.contexts.find((x: any) => x.organizationId === A.id);
    const ctxB = step.data.contexts.find((x: any) => x.organizationId === B.id);
    c.token = (await c.post('/auth/context', { key: ctxA.key })).data.accessToken;
    const sessionA = await c.get('/auth/session');
    assert.equal(sessionA.data.context.organizationId, A.id);
    assert.ok(sessionA.data.permissions.includes('reservations.create'));
    const switched = await c.post('/auth/context', { key: ctxB.key });
    assert.equal(switched.status, 200);
    c.token = switched.data.accessToken;
    const sessionB = await c.get('/auth/session');
    assert.equal(sessionB.data.context.organizationId, B.id);
    // Na empresa B o perfil é de consulta: a troca não leva as permissões de A.
    assert.ok(!sessionB.data.permissions.includes('reservations.create'));
  });

  test('chave de contexto forjada é recusada', async () => {
    const c = new Client();
    await c.login(A.users.owner!);
    const bOwner = await asPlatform((tx) => tx.membership.findFirst({ where: { organizationId: B.id, role: { key: 'owner' } } }));
    const forged = await c.post('/auth/context', { key: `staff:${bOwner!.id}` });
    assert.equal(forged.status, 403);
  });

  test('Master exige MFA; com TOTP válido o acesso é liberado', async () => {
    const email = await createPlatformUser('SUPER');
    const c = new Client();
    const step = await c.post('/auth/login', { email, password: PASSWORD });
    c.token = step.data.ticket;
    const denied = await c.post('/auth/context', { key: 'platform' });
    assert.equal(denied.status, 403);
    // Ativa o MFA direto no banco para simular o usuário que configurou o app autenticador.
    const { CryptoService } = require('../dist/common/crypto.service');
    const crypto = new CryptoService();
    const secret = 'JBSWY3DPEHPK3PXP';
    await asPlatform((tx) => tx.user.update({ where: { email }, data: { mfaEnabled: true, mfaSecretEnc: crypto.encrypt(secret) } }));
    const c2 = new Client();
    const s1 = await c2.post('/auth/login', { email, password: PASSWORD });
    assert.equal(s1.data.step, 'mfa');
    c2.token = s1.data.ticket;
    assert.equal((await c2.post('/auth/mfa', { code: '000000' })).status, 401);
    const s2 = await c2.post('/auth/mfa', { code: totpCode(secret) });
    assert.equal(s2.data.step, 'context');
    c2.token = s2.data.ticket;
    const ok = await c2.post('/auth/context', { key: 'platform' });
    assert.equal(ok.status, 200);
  });
});

describe('Permissões e escopo de filial', () => {
  test('perfil sem permissão recebe 403 no servidor', async () => {
    const c = new Client();
    await c.login(A.users.viewer!);
    assert.equal((await c.get('/members')).status, 403);
    assert.equal((await c.post('/branches', { code: 'X1', name: 'Nova' })).status, 403);
  });

  test('gerente de loja vê só a filial atribuída', async () => {
    const c = new Client();
    await c.login(A.users.branch_manager!);
    const res = await c.get('/branches');
    assert.deepEqual(res.data.map((b: any) => b.id), [A.branchId]);
  });

  test('campo desconhecido no corpo é erro', async () => {
    const c = new Client();
    await c.login(A.users.owner!);
    const res = await c.post('/branches', { code: 'NV1', name: 'Nova', organizationId: B.id });
    assert.equal(res.status, 400);
  });

  test('alterar perfil gera auditoria com antes e depois', async () => {
    const c = new Client();
    await c.login(A.users.owner!);
    const roles = (await c.get('/roles')).data;
    const viewer = roles.find((r: any) => r.key === 'viewer');
    const res = await c.patch(`/roles/${viewer.id}`, { permissions: [...viewer.permissions, 'reports.export'] });
    assert.equal(res.status, 200);
    const audit = await c.get(`/audit?entityType=Role&entityId=${viewer.id}`);
    const entry = audit.data.items.find((i: any) => i.action === 'role.updated');
    assert.ok(entry);
    assert.ok(!entry.before.permissions.includes('reports.export'));
    assert.ok(entry.after.permissions.includes('reports.export'));
  });

  test('não é possível remover o último administrador', async () => {
    const c = new Client();
    await c.login(A.users.owner!);
    const roles = (await c.get('/roles')).data;
    const owner = roles.find((r: any) => r.key === 'owner');
    const admin = roles.find((r: any) => r.key === 'admin');
    await c.patch(`/roles/${admin.id}`, { permissions: ['dashboard.view'] });
    const res = await c.patch(`/roles/${owner.id}`, { permissions: ['dashboard.view'] });
    assert.equal(res.status, 409);
  });

  test('convite de usuário novo gera link de acesso quando não há SMTP', async () => {
    const c = new Client();
    await c.login(A.users.owner!);
    const roles = (await c.get('/roles')).data;
    const res = await c.post('/members', {
      email: `convidado-${Date.now()}@teste.test`, name: 'Convidado', roleId: roles.find((r: any) => r.key === 'rental_agent').id,
      allBranches: false, branchIds: [A.branchId],
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.emailStatus, 'NOT_CONFIGURED');
    assert.match(res.data.accessLink, /redefinir-senha\?token=/);
    const token = decodeURIComponent(res.data.accessLink.split('token=')[1]);
    const reset = await new Client().post('/auth/password/reset', { token, newPassword: 'NovaSenha#2026' });
    assert.equal(reset.status, 204);
  });
});
