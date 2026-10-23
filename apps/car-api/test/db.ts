/** Acesso direto ao banco de teste para preparar cenários (com bypass de RLS). */
import { PrismaClient } from '../src/generated/prisma';
import { hash } from '@node-rs/argon2';
import { provisionOrganization } from '../src/common/provisioning';
import { PASSWORD, unique } from './helpers';

export const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

export async function asPlatform<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  }, { timeout: 60_000 });
}

let passwordHash: string | null = null;
async function pw(): Promise<string> {
  passwordHash ??= await hash(PASSWORD);
  return passwordHash;
}

export interface TestOrg {
  id: string;
  slug: string;
  branchId: string;
  branch2Id: string;
  roles: Record<string, string>;
  users: Record<string, string>;
}

/**
 * Empresa de teste com duas filiais e um usuário por perfil-modelo.
 * Os e-mails seguem `<perfil>@<slug>.test`.
 */
export async function createOrg(planCode = 'rede'): Promise<TestOrg> {
  const slug = unique('org');
  return asPlatform(async (tx) => {
    const plan = await tx.plan.findUniqueOrThrow({ where: { code: planCode } });
    const { organization, branch, roles } = await provisionOrganization(tx, {
      name: `Empresa de Teste ${slug}`, slug, planId: plan.id, firstBranch: { code: 'MTZ', name: 'Matriz' },
    });
    const branch2 = await tx.branch.create({ data: { organizationId: organization.id, code: 'FIL2', name: 'Filial 2' } });
    await tx.inventoryLocation.create({ data: { organizationId: organization.id, branchId: branch2.id, name: 'Almoxarifado' } });
    const users: Record<string, string> = {};
    for (const key of Object.keys(roles)) {
      const email = `${key}@${slug}.test`;
      const user = await tx.user.create({ data: { email, name: `Usuário ${key}`, passwordHash: await pw() } });
      const allBranches = ['owner', 'admin', 'finance', 'auditor', 'regional_manager'].includes(key);
      const m = await tx.membership.create({ data: { organizationId: organization.id, userId: user.id, roleId: roles[key], allBranches } });
      if (!allBranches) await tx.membershipBranch.create({ data: { membershipId: m.id, branchId: branch.id, organizationId: organization.id } });
      users[key] = email;
    }
    return { id: organization.id, slug, branchId: branch.id, branch2Id: branch2.id, roles, users };
  });
}

export async function createPlatformUser(role: 'SUPPORT' | 'ADMIN' | 'SUPER'): Promise<string> {
  const email = `${unique(role.toLowerCase())}@norty.test`;
  await asPlatform(async (tx) => tx.user.create({ data: { email, name: `Norty ${role}`, passwordHash: await pw(), platformRole: role } }));
  return email;
}
