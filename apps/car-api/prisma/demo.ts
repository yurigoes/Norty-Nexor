/**
 * Ambiente de DEMONSTRAÇÃO — nunca rode em produção.
 *
 *   npm run db:demo -w @nortycar/api
 *
 * Cria duas empresas fictícias, identificadas como demonstração, e
 * contas de acesso para cada perfil. Não cria veículos, clientes nem
 * lançamentos: o painel começa vazio, como o de uma locadora real no
 * primeiro dia, e os dados nascem pelo uso (ou pela suíte de testes).
 *
 * Senha de todas as contas: DEMO_PASSWORD (padrão: NortyCar#Demo2026).
 */
import { PrismaClient } from '../src/generated/prisma';
import { hash } from '@node-rs/argon2';
import { provisionOrganization } from '../src/common/provisioning';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('O seed de demonstração não roda em produção.');
  const password = await hash(process.env.DEMO_PASSWORD ?? 'NortyCar#Demo2026');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    const plan = await tx.plan.findUniqueOrThrow({ where: { code: 'rede' } });

    const user = async (email: string, name: string, platformRole: 'NONE' | 'SUPER' | 'SUPPORT' = 'NONE') =>
      tx.user.upsert({ where: { email }, create: { email, name, passwordHash: password, platformRole }, update: {} });

    await user('master@nortycar.test', 'Master Norty (demonstração)', 'SUPER');
    await user('suporte@nortycar.test', 'Suporte Norty (demonstração)', 'SUPPORT');

    for (const [slug, name, code, city] of [
      ['demo-alfa', 'Locadora Demonstração Alfa', 'MTZ', 'Belo Horizonte'],
      ['demo-beta', 'Locadora Demonstração Beta', 'MTZ', 'Curitiba'],
    ] as const) {
      if (await tx.organization.findUnique({ where: { slug } })) continue;
      const { organization, branch, roles } = await provisionOrganization(tx, {
        name, slug, planId: plan.id, firstBranch: { code, name: `${name} — Matriz`, city, state: slug === 'demo-alfa' ? 'MG' : 'PR' },
      });
      const second = await tx.branch.create({
        data: { organizationId: organization.id, code: 'FIL2', name: `${name} — Filial 2`, city, state: slug === 'demo-alfa' ? 'MG' : 'PR' },
      });
      await tx.inventoryLocation.create({ data: { organizationId: organization.id, branchId: second.id, name: 'Almoxarifado' } });
      const prefix = slug.replace('demo-', '');
      const members: [string, string, string, boolean][] = [
        ['proprietario', 'Proprietário', 'owner', true],
        ['gerente', 'Gerente de loja', 'branch_manager', false],
        ['atendente', 'Atendente de locação', 'rental_agent', false],
        ['financeiro', 'Financeiro', 'finance', true],
        ['vistoriador', 'Vistoriador', 'inspector', false],
        ['mecanico', 'Mecânico', 'mechanic', false],
        ['almoxarife', 'Almoxarife', 'storekeeper', false],
        ['auditor', 'Auditor', 'auditor', true],
      ];
      for (const [local, label, roleKey, allBranches] of members) {
        const u = await user(`${local}.${prefix}@nortycar.test`, `${label} ${prefix === 'alfa' ? 'Alfa' : 'Beta'} (demonstração)`);
        const m = await tx.membership.create({
          data: {
            organizationId: organization.id, userId: u.id, roleId: roles[roleKey]!, allBranches,
            approvalLimit: roleKey === 'branch_manager' ? 2000 : null,
          },
        });
        if (!allBranches) {
          await tx.membershipBranch.create({ data: { membershipId: m.id, branchId: branch.id, organizationId: organization.id } });
        }
      }
      console.log(`Empresa de demonstração: ${name}`);
    }
  }, { timeout: 60_000 });
  console.log('Contas: master@, suporte@, proprietario.alfa@, gerente.alfa@, atendente.alfa@, financeiro.alfa@ ... nortycar.test');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
