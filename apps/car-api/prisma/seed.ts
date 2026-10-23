/**
 * Seed de base — seguro para produção.
 *
 *   npm run db:seed -w @nortycar/api
 *
 * Cria os planos comerciais (sem preço: o valor é decisão comercial e se
 * define no Master) e, se as variáveis abaixo existirem, a primeira conta
 * do Master Norty, com troca de senha obrigatória:
 *
 *   BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD
 *
 * Idempotente: rodar de novo não duplica nada.
 */
import { PrismaClient } from '../src/generated/prisma';
import { hash } from '@node-rs/argon2';
import { MODULE_LABEL, type ModuleKey } from '@nortycar/shared';

const prisma = new PrismaClient();

const ALL_MODULES = Object.keys(MODULE_LABEL) as ModuleKey[];

const PLANS: { code: string; name: string; description: string; modules: ModuleKey[]; maxVehicles: number | null; maxBranches: number | null; maxUsers: number | null }[] = [
  {
    code: 'essencial', name: 'Essencial',
    description: 'Frota, reservas, contratos, financeiro, vistorias e portal do cliente.',
    modules: ['core', 'fleet', 'rentals', 'finance', 'inspections', 'portal', 'reports', 'site'],
    maxVehicles: 50, maxBranches: 1, maxUsers: 10,
  },
  {
    code: 'profissional', name: 'Profissional',
    description: 'Tudo do Essencial, mais estoque, manutenção, infrações, sinistros e abastecimentos.',
    modules: ['core', 'fleet', 'rentals', 'finance', 'inspections', 'inventory', 'maintenance', 'infractions', 'claims', 'refuel', 'portal', 'reports', 'site', 'sales'],
    maxVehicles: 300, maxBranches: 5, maxUsers: 50,
  },
  {
    code: 'rede', name: 'Rede',
    description: 'Todos os módulos, incluindo Norty IA e API de integração, sem limites de frota e filiais.',
    modules: ALL_MODULES,
    maxVehicles: null, maxBranches: null, maxUsers: null,
  },
];

async function main(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    for (const plan of PLANS) {
      await tx.plan.upsert({
        where: { code: plan.code },
        create: { ...plan, priceMonthly: 0 },
        update: { name: plan.name, description: plan.description, modules: plan.modules },
      });
    }

    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (email && password) {
      if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD precisa ter ao menos 12 caracteres.');
      const existing = await tx.user.findUnique({ where: { email } });
      if (!existing) {
        await tx.user.create({
          data: {
            email, name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrador Norty', platformRole: 'SUPER',
            passwordHash: await hash(password), mustChangePassword: true,
          },
        });
        console.log(`Conta do Master criada: ${email} (troca de senha obrigatória no primeiro acesso).`);
      }
    }
  });
  console.log(`Planos: ${PLANS.map((p) => p.name).join(', ')} (preços a definir no Master).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
