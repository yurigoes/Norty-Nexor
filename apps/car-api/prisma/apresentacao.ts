/**
 * Ambiente de APRESENTAÇÃO — nunca rode com dados reais.
 *
 *   npm run db:apresentacao -w @nortycar/api
 *
 * Cria a locadora "Araújo Veículos" (logo, site publicado, tarifas, frota
 * de demonstração com placas de teste TST…) e um login único para
 * apresentar o sistema:
 *
 *   demo@nortycar.test  /  senha DEMO_LOGIN_PASSWORD (padrão 1234)
 *
 * A conta entra como proprietário da Araújo, troca de perfil pelo menu do
 * usuário ("Modo apresentação — ver como") e também acessa o portal do
 * cliente e o Master pela troca de contexto. Para a troca de perfil
 * funcionar, a API precisa de DEMO_ROLE_SWITCH_EMAILS=demo@nortycar.test.
 *
 * A senha curta é aceita só porque o seed grava o hash direto: a política
 * de senha da API continua valendo para qualquer troca de senha.
 * Idempotente: rodar de novo não duplica nada.
 */
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '../src/generated/prisma';
// Do build: assim o seed roda também na imagem de produção, que não leva o fonte.
import { provisionOrganization } from '../dist/common/provisioning';

const prisma = new PrismaClient();
const EMAIL = 'demo@nortycar.test';
const SLUG = 'araujo-veiculos';
const STORAGE = resolve(process.env.STORAGE_DIR ?? './storage');

const RATES: Record<string, [number, number, number, number, number]> = {
  // diária, semanal, mensal, km/dia, caução
  COMPACTO: [139.9, 840, 2490, 200, 1000],
  SEDA: [169.9, 990, 2890, 200, 1000],
  MINIVAN: [199.9, 1190, 3290, 200, 1200],
  SUV: [229.9, 1390, 3690, 200, 1500],
  CAMINHAO: [890, 5490, 18900, 400, 5000],
};

async function main(): Promise<void> {
  const password = await hash(process.env.DEMO_LOGIN_PASSWORD ?? '1234');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    const plan = await tx.plan.findUniqueOrThrow({ where: { code: 'rede' } });

    let org = await tx.organization.findUnique({ where: { slug: SLUG } });
    if (!org) {
      const created = await provisionOrganization(tx, {
        name: 'Araújo Veículos', legalName: 'Araújo Veículos (apresentação)', slug: SLUG, planId: plan.id,
        email: 'contato@araujoveiculos.test', phone: '(00) 0000-0000',
        firstBranch: { code: 'MTZ', name: 'Araújo Veículos — Matriz', city: 'Cidade sede', state: 'SP' },
      });
      org = created.organization;
    }
    const orgId = org.id;
    const branch = await tx.branch.findFirstOrThrow({ where: { organizationId: orgId, code: 'MTZ' } });

    // Caminhões: categoria e modelos que o catálogo inicial não traz.
    const truck = await tx.vehicleCategory.upsert({
      where: { organizationId_code: { organizationId: orgId, code: 'CAMINHAO' } },
      create: { organizationId: orgId, code: 'CAMINHAO', name: 'Caminhão' }, update: {},
    });
    for (const [make, model] of [['Volvo', 'FH'], ['Scania', 'R'], ['Mercedes-Benz', 'Actros']]) {
      const mk = await tx.vehicleMake.upsert({ where: { organizationId_name: { organizationId: orgId, name: make! } }, create: { organizationId: orgId, name: make! }, update: {} });
      const exists = await tx.vehicleModel.findFirst({ where: { organizationId: orgId, makeId: mk.id, name: model } });
      if (!exists) await tx.vehicleModel.create({ data: { organizationId: orgId, makeId: mk.id, categoryId: truck.id, name: model!, doors: 2, seats: 2, bodyType: 'Cavalo mecânico' } });
    }

    // Tarifas por categoria e serviços adicionais.
    for (const cat of await tx.vehicleCategory.findMany({ where: { organizationId: orgId } })) {
      const r = RATES[cat.code];
      if (!r || (await tx.rateTable.findFirst({ where: { organizationId: orgId, categoryId: cat.id, branchId: null } }))) continue;
      await tx.rateTable.create({
        data: {
          organizationId: orgId, categoryId: cat.id, name: `Tarifa ${cat.name}`, dailyRate: r[0], weeklyRate: r[1], longTermMonthly: r[2],
          includedKmPerDay: r[3], extraKmRate: cat.code === 'CAMINHAO' ? 2.5 : 0.9, additionalDriverDaily: 30, depositAmount: r[4],
          longTermKmPerMonth: cat.code === 'CAMINHAO' ? 10000 : 3000,
        },
      });
    }
    for (const [name, pricing, price] of [['Cadeirinha infantil', 'PER_DAY', 15], ['Seguro com franquia reduzida', 'PER_DAY', 39.9], ['Lavagem completa', 'FIXED', 60]] as const) {
      await tx.extraService.upsert({ where: { organizationId_name: { organizationId: orgId, name } }, create: { organizationId: orgId, name, pricing, price }, update: {} });
    }

    // Frota de demonstração: duas unidades por modelo de carro, uma por caminhão
    // (exceto o FH, que fica sem unidade para mostrar o selo "Indisponível").
    if (!(await tx.vehicleUnit.count({ where: { organizationId: orgId } }))) {
      const models = await tx.vehicleModel.findMany({ where: { organizationId: orgId }, include: { category: true }, orderBy: { name: 'asc' } });
      const colors = ['Vermelho', 'Branco', 'Prata', 'Preto', 'Azul'];
      const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
      let i = 0;
      for (const m of models) {
        const isTruck = m.category.code === 'CAMINHAO';
        if (m.name === 'FH') continue;
        for (let n = 0; n < (isTruck ? 1 : 2); n += 1, i += 1) {
          const v = await tx.vehicleUnit.create({
            data: {
              organizationId: orgId, branchId: branch.id, modelId: m.id, categoryId: m.categoryId,
              internalCode: `DEMO-${String(i + 1).padStart(3, '0')}`, plate: `TST${i % 10}${L[i % L.length]}${String(10 + i).slice(-2)}`,
              yearManufacture: 2024, yearModel: 2025, color: colors[i % colors.length]!, fuel: isTruck ? 'DIESEL' : 'FLEX',
              transmission: isTruck ? 'AUTOMATED' : 'MANUAL', odometerKm: 1000 + i * 3500, initialOdometerKm: 1000 + i * 3500,
              notes: 'Veículo de demonstração',
            },
          });
          await tx.vehicleTimelineEvent.create({ data: { organizationId: orgId, vehicleUnitId: v.id, type: 'CREATED', title: 'Veículo cadastrado (demonstração)', actorName: 'Seed de apresentação' } });
        }
      }
    }

    // Logo e banner do site.
    const site = await tx.siteConfig.findUniqueOrThrow({ where: { organizationId: orgId } });
    const store = async (file: string, category: string) => {
      const buffer = readFileSync(join(__dirname, 'apresentacao', file));
      const storageKey = `${orgId}/apresentacao/${randomUUID()}.jpg`;
      mkdirSync(join(STORAGE, orgId, 'apresentacao'), { recursive: true });
      writeFileSync(join(STORAGE, storageKey), buffer);
      const asset = await tx.fileAsset.create({
        data: {
          organizationId: orgId, storageKey, originalName: file, mimeType: 'image/jpeg', size: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'), entityType: 'SiteConfig', entityId: orgId, category,
        },
      });
      return asset.id;
    };
    await tx.siteConfig.update({
      where: { organizationId: orgId },
      data: {
        published: true, brandName: 'Araújo Veículos', primaryColor: '#C8102E', accentColor: '#1F3A7A',
        logoFileId: site.logoFileId ?? (await store('araujo-logo.jpg', 'logo')),
        bannerFileId: site.bannerFileId ?? (await store('araujo-banner.jpg', 'banner')),
        heroTitle: 'Aluguel, compra e venda de carros e caminhões',
        heroSubtitle: 'Do carro do dia a dia ao cavalo mecânico para a sua operação. Diárias, planos mensais e veículos à venda.',
        about: 'A Araújo Veículos atende pessoas e empresas com locação de carros e caminhões, além de compra e venda de veículos.',
        faq: [
          { question: 'Quais documentos preciso para alugar?', answer: 'CNH válida na categoria do veículo, documento com foto e comprovante de endereço.' },
          { question: 'Tem plano mensal?', answer: 'Sim, para carros e caminhões, com franquia de quilometragem.' },
        ],
        whatsapp: '5500000000000', phone: '(00) 0000-0000', email: 'contato@araujoveiculos.test', citiesServed: ['Cidade sede'],
        seoTitle: 'Araújo Veículos — aluguel, compra e venda',
        seoDescription: 'Aluguel de carros e caminhões, planos mensais e compra e venda de veículos.',
      },
    });

    // Login único de apresentação: proprietário da Araújo, cliente no portal e Master.
    const user = await tx.user.upsert({
      where: { email: EMAIL },
      create: { email: EMAIL, name: 'Apresentação Norty Car', passwordHash: password, platformRole: 'SUPER' },
      update: { passwordHash: password, active: true, failedLogins: 0, lockedUntil: null, mustChangePassword: false },
    });
    const owner = await tx.role.findFirstOrThrow({ where: { organizationId: orgId, key: 'owner' } });
    await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      create: { organizationId: orgId, userId: user.id, roleId: owner.id, allBranches: true, title: 'Conta de apresentação' },
      update: { active: true },
    });
    const customer = await tx.customer.upsert({
      where: { organizationId_document: { organizationId: orgId, document: '52998224725' } },
      create: { organizationId: orgId, type: 'PF', name: 'Cliente de Apresentação', document: '52998224725', email: EMAIL, city: 'Cidade sede', state: 'SP' },
      update: {},
    });
    await tx.customerLink.upsert({
      where: { userId_customerId: { userId: user.id, customerId: customer.id } },
      create: { organizationId: orgId, userId: user.id, customerId: customer.id }, update: { active: true },
    });
  }, { timeout: 120_000 });
  console.log(`Apresentação pronta: ${EMAIL} — site em /site/${SLUG}`);
  console.log('Lembre de configurar na API: DEMO_ROLE_SWITCH_EMAILS=demo@nortycar.test');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
