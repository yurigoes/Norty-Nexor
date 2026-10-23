import {
  DEFAULT_CHECKLIST, INITIAL_CATALOG, INITIAL_CATEGORIES, INITIAL_INVENTORY_CATEGORIES, INITIAL_SERVICE_TYPES,
  ROLE_TEMPLATES, type RoleTemplateKey,
} from '@nortycar/shared';
import type { Prisma } from '../generated/prisma';
import type { Tx } from './prisma.service';
import { DEFAULT_ORG_SETTINGS } from './org-settings';

export interface ProvisionInput {
  name: string;
  legalName?: string | null;
  document?: string | null;
  slug: string;
  email?: string | null;
  phone?: string | null;
  planId: string;
  trialDays?: number;
  firstBranch: { code: string; name: string; city?: string | null; state?: string | null };
}

/**
 * Cria a estrutura base de uma empresa: assinatura, primeira filial,
 * perfis-modelo, catálogo de referência, categorias de estoque, tipos de
 * serviço, checklist de vistoria, centros de custo e site (despublicado).
 *
 * Nenhum veículo, cliente, tarifa ou valor é criado: o que é operação
 * real nasce pelas mãos da locadora.
 *
 * Precisa rodar numa transação de plataforma (bypass de RLS), porque a
 * empresa ainda não existe quando a transação começa.
 */
export async function provisionOrganization(tx: Tx, input: ProvisionInput) {
  const organization = await tx.organization.create({
    data: {
      name: input.name,
      legalName: input.legalName ?? null,
      document: input.document ?? null,
      slug: input.slug,
      email: input.email ?? null,
      phone: input.phone ?? null,
      status: input.trialDays ? 'TRIAL' : 'ACTIVE',
      settings: DEFAULT_ORG_SETTINGS as unknown as Prisma.InputJsonValue,
    },
  });
  const organizationId = organization.id;

  await tx.subscription.create({
    data: {
      organizationId,
      planId: input.planId,
      status: input.trialDays ? 'TRIALING' : 'ACTIVE',
      trialEndsAt: input.trialDays ? new Date(Date.now() + input.trialDays * 86_400_000) : null,
    },
  });

  const branch = await tx.branch.create({
    data: { organizationId, code: input.firstBranch.code, name: input.firstBranch.name, city: input.firstBranch.city, state: input.firstBranch.state },
  });

  const roles: Record<string, string> = {};
  for (const [key, template] of Object.entries(ROLE_TEMPLATES) as [RoleTemplateKey, (typeof ROLE_TEMPLATES)[RoleTemplateKey]][]) {
    const role = await tx.role.create({
      data: { organizationId, key, name: template.name, description: template.description, permissions: template.permissions, templateKey: key },
    });
    roles[key] = role.id;
  }

  const categories: Record<string, string> = {};
  for (const c of INITIAL_CATEGORIES) {
    categories[c.code] = (await tx.vehicleCategory.create({ data: { organizationId, code: c.code, name: c.name } })).id;
  }
  const makes: Record<string, string> = {};
  for (const item of INITIAL_CATALOG) {
    makes[item.make] ??= (await tx.vehicleMake.create({ data: { organizationId, name: item.make } })).id;
    await tx.vehicleModel.create({
      data: {
        organizationId, makeId: makes[item.make]!, categoryId: categories[item.category]!, name: item.model,
        doors: item.doors, seats: item.seats,
      },
    });
  }

  await tx.inventoryCategory.createMany({ data: INITIAL_INVENTORY_CATEGORIES.map((name) => ({ organizationId, name })) });
  await tx.maintenanceServiceType.createMany({ data: INITIAL_SERVICE_TYPES.map((name) => ({ organizationId, name })) });
  await tx.inventoryLocation.create({ data: { organizationId, branchId: branch.id, name: 'Almoxarifado' } });
  await tx.inspectionTemplate.create({
    data: { organizationId, name: 'Checklist padrão', items: DEFAULT_CHECKLIST as unknown as Prisma.InputJsonValue, isDefault: true },
  });
  await tx.costCenter.createMany({
    data: [
      { organizationId, code: 'OPER', name: 'Operação de locação' },
      { organizationId, code: 'FROTA', name: 'Manutenção de frota' },
      { organizationId, code: 'ADM', name: 'Administrativo' },
    ],
  });
  await tx.siteConfig.create({ data: { organizationId, brandName: input.name, published: false } });

  return { organization, branch, roles };
}
