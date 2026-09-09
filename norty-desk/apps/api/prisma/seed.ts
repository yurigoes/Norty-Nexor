/**
 * Semeia a estrutura base de uma organização de demonstração.
 *
 * `npm run db:seed`
 *
 * Fora do modo de demonstração as contas nascem com troca de senha
 * obrigatória — aqui também, exceto se DEMO=1.
 */
import { DEFAULT_BUSINESS_HOURS, DEFAULT_PRIORITY_MATRIX } from '@norty-desk/shared';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const DEMO = process.env.DEMO === '1';

/** Feriados nacionais fixos. Os móveis entram por importação anual. */
const FERIADOS_FIXOS: { nome: string; mes: number; dia: number }[] = [
  { nome: 'Confraternização Universal', mes: 1, dia: 1 },
  { nome: 'Tiradentes', mes: 4, dia: 21 },
  { nome: 'Dia do Trabalho', mes: 5, dia: 1 },
  { nome: 'Independência', mes: 9, dia: 7 },
  { nome: 'Nossa Senhora Aparecida', mes: 10, dia: 12 },
  { nome: 'Finados', mes: 11, dia: 2 },
  { nome: 'Proclamação da República', mes: 11, dia: 15 },
  { nome: 'Natal', mes: 12, dia: 25 },
];

async function main() {
  const organizacao = await prisma.organization.upsert({
    where: { slug: 'norty' },
    update: {},
    create: {
      slug: 'norty',
      name: 'Norty',
      priorityMatrix: DEFAULT_PRIORITY_MATRIX,
    },
  });

  // --- Calendário comercial -----------------------------------------
  const calendario = await prisma.calendar.upsert({
    where: { organizationId_name: { organizationId: organizacao.id, name: 'Comercial' } },
    update: {},
    create: {
      organizationId: organizacao.id,
      name: 'Comercial',
      timezone: 'America/Sao_Paulo',
      segments: { create: DEFAULT_BUSINESS_HOURS },
      holidays: {
        create: FERIADOS_FIXOS.map((f) => ({
          name: f.nome,
          date: new Date(Date.UTC(2000, f.mes - 1, f.dia)),
          isRecurring: true,
        })),
      },
    },
  });

  // --- Acordos ------------------------------------------------------
  // TTO curto e TTR longo: atender rápido importa mais que resolver
  // rápido, e é o que o cliente percebe.
  const acordos = [
    { name: 'Padrão — primeiro atendimento', kind: 'SLA' as const, target: 'TTO' as const, durationSeconds: 2 * 3600 },
    { name: 'Padrão — resolução', kind: 'SLA' as const, target: 'TTR' as const, durationSeconds: 3 * 9 * 3600 },
    { name: 'Interno — primeiro atendimento', kind: 'OLA' as const, target: 'TTO' as const, durationSeconds: 3600 },
    { name: 'Interno — resolução', kind: 'OLA' as const, target: 'TTR' as const, durationSeconds: 2 * 9 * 3600 },
  ];

  const acordosCriados = [];
  for (const acordo of acordos) {
    acordosCriados.push(await prisma.agreement.upsert({
      where: {
        organizationId_name_kind_target: {
          organizationId: organizacao.id,
          name: acordo.name,
          kind: acordo.kind,
          target: acordo.target,
        },
      },
      update: {},
      create: { ...acordo, organizationId: organizacao.id, calendarId: calendario.id },
    }));
  }

  // Os acordos externos valem para todo o catálogo. Os internos (OLA)
  // ficam de fora do padrão: quem os usa, usa por time, e ligá-los a
  // tudo mediria uma promessa que ninguém fez.
  const padrao = acordosCriados.filter((a) => a.kind === 'SLA').map((a) => ({ id: a.id }));

  // --- Motivos de pendência -----------------------------------------
  await prisma.pendingReason.upsert({
    where: { organizationId_name: { organizationId: organizacao.id, name: 'Aguardando o solicitante' } },
    update: {},
    create: {
      organizationId: organizacao.id,
      name: 'Aguardando o solicitante',
      // Cobra a cada dois dias úteis; resolve sozinho após três cobranças
      // sem resposta. É o recurso do GLPI que resolve chamado eterno.
      followupIntervalSeconds: 2 * 24 * 3600,
      followupsBeforeResolution: 3,
      followupTemplate:
        'Olá! Ainda precisamos de um retorno seu para seguir com o chamado {{numero}}. ' +
        'Se não houver resposta, ele será encerrado automaticamente.',
      isDefault: true,
    },
  });

  // --- Times ---------------------------------------------------------
  const suporte = await prisma.team.upsert({
    where: { organizationId_name: { organizationId: organizacao.id, name: 'Suporte N1' } },
    update: {},
    create: {
      organizationId: organizacao.id,
      name: 'Suporte N1',
      email: 'suporte@norty.com.br',
    },
  });

  // --- Categorias ----------------------------------------------------
  // `upsert` não serve aqui: a chave composta inclui `parentId`, que é
  // nulo nas raízes, e Prisma não aceita nulo em chave única composta.
  const raizes = ['Hardware', 'Software', 'Acesso', 'Rede', 'Dúvida'];
  for (const nome of raizes) {
    const existente = await prisma.category.findFirst({
      where: { organizationId: organizacao.id, parentId: null, name: nome },
      select: { id: true },
    });

    if (existente) {
      await prisma.category.update({
        where: { id: existente.id },
        data: { defaultAgreements: { set: padrao } },
      });
    } else {
      await prisma.category.create({
        data: {
          organizationId: organizacao.id,
          name: nome,
          defaultTeamId: suporte.id,
          defaultAgreements: { connect: padrao },
        },
      });
    }
  }

  // --- Contas --------------------------------------------------------
  const senha = await argon2.hash(DEMO ? '123456' : crypto.randomUUID(), { type: argon2.argon2id });

  const contas: { email: string; name: string; role: 'ADMINISTRADOR' | 'SUPERVISOR' | 'AGENTE' | 'GESTOR' | 'SOLICITANTE' }[] = [
    { email: 'admin@desk.test', name: 'Administrador', role: 'ADMINISTRADOR' },
    { email: 'supervisor@desk.test', name: 'Supervisora', role: 'SUPERVISOR' },
    { email: 'agente@desk.test', name: 'Agente', role: 'AGENTE' },
    { email: 'gestor@desk.test', name: 'Gestor', role: 'GESTOR' },
    { email: 'solicitante@desk.test', name: 'Solicitante', role: 'SOLICITANTE' },
  ];

  for (const conta of contas) {
    const usuario = await prisma.user.upsert({
      where: { email: conta.email },
      update: {},
      create: {
        email: conta.email,
        name: conta.name,
        passwordHash: senha,
        mustChangePassword: !DEMO,
      },
    });

    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: usuario.id, organizationId: organizacao.id } },
      update: { role: conta.role },
      create: { userId: usuario.id, organizationId: organizacao.id, role: conta.role },
    });

    if (conta.role === 'AGENTE' || conta.role === 'SUPERVISOR') {
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: suporte.id, userId: usuario.id } },
        update: {},
        create: { teamId: suporte.id, userId: usuario.id, isManager: conta.role === 'SUPERVISOR' },
      });
    }
  }

  console.log(
    DEMO
      ? 'Semeado com dados de demonstração. Senha das contas: 123456'
      : 'Estrutura base semeada. As contas nascem com troca de senha obrigatória.',
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
