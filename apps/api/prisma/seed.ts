/**
 * Semeadura do banco.
 *
 * Roda em dois modos:
 *
 *   npm run db:seed              estrutura mínima para operar de verdade
 *   SEED_DEMO=true npm run db:seed  + dados fictícios para demonstração
 *
 * É idempotente: usa `upsert` em tudo que tem chave natural, então rodar
 * duas vezes não duplica nada. Isso importa porque o script de bootstrap
 * do servidor chama a semeadura a cada deploy — ela precisa ser segura de
 * repetir, não algo que só pode acontecer uma vez.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();
const DEMO = process.env.SEED_DEMO === 'true';

/** Gerador determinístico: a mesma semente reconstrói o mesmo condomínio. */
class Rng {
  private state: number;
  constructor(seed: string) {
    let s = 0;
    for (let i = 0; i < seed.length; i += 1) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    this.state = s || 1;
  }
  next(): number {
    let x = this.state;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.state = x;
    return x / 0xffffffff;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!;
  }
  bool(chance = 0.5): boolean {
    return this.next() < chance;
  }
}

const rng = new Rng('myhome-parque-central');

const FIRST_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael',
  'Sofia', 'Thiago', 'Vanessa', 'Wagner',
];
const LAST_NAMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferreira', 'Gomes', 'Henriques',
  'Ibrahim', 'Julio', 'Lima', 'Martins', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz',
  'Ribeiro', 'Santos', 'Teixeira', 'Vasconcelos',
];

function fullName(): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

function cpf(): string {
  const part = () => String(rng.int(100, 999));
  return `${part()}.${part()}.${part()}-${String(rng.int(10, 99))}`;
}

function phone(): string {
  return `(11) 9${rng.int(1000, 9999)}-${rng.int(1000, 9999)}`;
}

function emailFor(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z]+/g, '.');
  return `${slug}${index}@exemplo.com.br`;
}

/* ---------------- Estrutura base ---------------- */

const TOWERS = [
  { name: 'Aurora', block: 'A', floors: 26, unitsPerFloor: 12 },
  { name: 'Boreal', block: 'B', floors: 26, unitsPerFloor: 12 },
  { name: 'Cristal', block: 'C', floors: 26, unitsPerFloor: 12 },
  { name: 'Diamante', block: 'D', floors: 26, unitsPerFloor: 12 },
];

const COMMON_AREAS: {
  name: string;
  kind: Prisma.CommonAreaCreateInput['kind'];
  capacity: number;
  fee: number;
  deposit: number;
  autoApprove: boolean;
  slots: string[];
  openDays: number[];
  rules: string[];
}[] = [
  { name: 'Salão de Festas', kind: 'salao_festas', capacity: 120, fee: 350, deposit: 500, autoApprove: false,
    slots: ['10:00 - 16:00', '17:00 - 23:00'], openDays: [0, 5, 6],
    rules: ['Som até 23h', 'Limpeza por conta do morador', 'Máximo de 120 pessoas'] },
  { name: 'Salão Gourmet', kind: 'salao_gourmet', capacity: 40, fee: 180, deposit: 250, autoApprove: false,
    slots: ['11:00 - 15:00', '18:00 - 23:00'], openDays: [0, 4, 5, 6],
    rules: ['Churrasqueira inclusa', 'Devolver utensílios limpos'] },
  { name: 'Churrasqueira Coberta', kind: 'churrasqueira', capacity: 25, fee: 90, deposit: 120, autoApprove: false,
    slots: ['11:00 - 16:00', '17:00 - 22:00'], openDays: [0, 5, 6],
    rules: ['Carvão por conta do morador'] },
  { name: 'Academia', kind: 'academia', capacity: 24, fee: 0, deposit: 0, autoApprove: true,
    slots: ['06:00 - 08:00', '08:00 - 10:00', '18:00 - 20:00', '20:00 - 22:00'],
    openDays: [0, 1, 2, 3, 4, 5, 6], rules: ['Uso de toalha obrigatório', 'Idade mínima 16 anos'] },
  { name: 'Piscina Adulto', kind: 'piscina', capacity: 60, fee: 0, deposit: 0, autoApprove: true,
    slots: ['09:00 - 12:00', '13:00 - 17:00'], openDays: [0, 2, 3, 4, 5, 6],
    rules: ['Exame dermatológico em dia', 'Proibido vidro na área'] },
  { name: 'Brinquedoteca', kind: 'brinquedoteca', capacity: 20, fee: 0, deposit: 0, autoApprove: true,
    slots: ['09:00 - 12:00', '14:00 - 18:00'], openDays: [0, 1, 2, 3, 4, 5, 6],
    rules: ['Criança acompanhada de responsável'] },
  { name: 'Quadra Poliesportiva', kind: 'quadra', capacity: 30, fee: 50, deposit: 0, autoApprove: true,
    slots: ['08:00 - 10:00', '10:00 - 12:00', '16:00 - 18:00', '18:00 - 20:00'],
    openDays: [0, 1, 2, 3, 4, 5, 6], rules: ['Calçado apropriado'] },
  { name: 'Coworking', kind: 'coworking', capacity: 16, fee: 0, deposit: 0, autoApprove: true,
    slots: ['08:00 - 12:00', '13:00 - 18:00'], openDays: [1, 2, 3, 4, 5],
    rules: ['Silêncio nas baias', 'Reuniões na sala fechada'] },
  { name: 'Espaço Pet', kind: 'espaco_pet', capacity: 12, fee: 0, deposit: 0, autoApprove: true,
    slots: ['07:00 - 11:00', '15:00 - 20:00'], openDays: [0, 1, 2, 3, 4, 5, 6],
    rules: ['Recolher dejetos', 'Coleira obrigatória na entrada'] },
  { name: 'Cinema', kind: 'cinema', capacity: 18, fee: 60, deposit: 0, autoApprove: false,
    slots: ['15:00 - 18:00', '19:00 - 22:00'], openDays: [0, 5, 6], rules: ['Sem alimentos gordurosos'] },
];

const GATES: { name: string; kind: Prisma.GateCreateInput['kind'] }[] = [
  { name: 'Portão Principal', kind: 'principal' },
  { name: 'Portão Garagem', kind: 'garagem' },
  { name: 'Portão de Serviço', kind: 'servico' },
  { name: 'Acesso Pedestres', kind: 'pedestre' },
];

const CAMERAS = [
  'Portaria Principal', 'Hall Torre A', 'Hall Torre B', 'Hall Torre C', 'Hall Torre D',
  'Garagem S1', 'Garagem S2', 'Piscina', 'Playground', 'Quadra', 'Portão de Serviço', 'Perímetro Norte',
];

async function main(): Promise<void> {
  console.log(`Semeando o banco${DEMO ? ' (com dados de demonstração)' : ''}...`);

  const tenant = await prisma.tenant.upsert({
    where: { document: '18.442.907/0001-56' },
    update: {},
    create: {
      name: 'Meridian Administração',
      legalName: 'Meridian Administração Condominial Ltda.',
      document: '18.442.907/0001-56',
      logoInitials: 'MA',
      city: 'São Paulo',
      state: 'SP',
      plan: 'enterprise',
    },
  });

  const condominium = await prisma.condominium.upsert({
    where: { document: '12.345.678/0001-90' },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Residencial Parque Central',
      shortName: 'Parque Central',
      address: 'Av. das Nações Unidas, 4.820',
      city: 'São Paulo',
      state: 'SP',
      zip: '04578-000',
      document: '12.345.678/0001-90',
      managerName: 'Helena Duarte',
    },
  });

  // ---- Torres e unidades ----
  const unitsByLabel = new Map<string, { id: string; block: string; label: string }>();

  for (const spec of TOWERS) {
    const tower = await prisma.tower.upsert({
      where: { id: `${condominium.id}-${spec.block}` },
      update: {},
      create: {
        id: `${condominium.id}-${spec.block}`,
        condominiumId: condominium.id,
        name: spec.name,
        floors: spec.floors,
        unitsPerFloor: spec.unitsPerFloor,
      },
    });

    const rows: Prisma.UnitCreateManyInput[] = [];
    for (let floor = 1; floor <= spec.floors; floor += 1) {
      for (let n = 1; n <= spec.unitsPerFloor; n += 1) {
        const label = `${floor}${String(n).padStart(2, '0')}`;
        rows.push({
          id: `${tower.id}-${label}`,
          condominiumId: condominium.id,
          towerId: tower.id,
          label,
          floor,
          block: spec.block,
          bedrooms: rng.int(1, 4),
          area: rng.int(52, 168),
          status: rng.bool(0.9) ? 'ocupada' : rng.bool(0.6) ? 'alugada' : 'vaga',
          ownerName: fullName(),
          parkingSpots: [`${spec.block}${rng.int(1, 3)}-${rng.int(100, 260)}`],
          monthlyFee: new Prisma.Decimal(rng.int(780, 1980)),
        });
        unitsByLabel.set(`${spec.block}-${label}`, { id: `${tower.id}-${label}`, block: spec.block, label });
      }
    }
    await prisma.unit.createMany({ data: rows, skipDuplicates: true });
    console.log(`  Torre ${spec.name}: ${rows.length} unidades`);
  }

  // ---- Áreas comuns, portões e câmeras ----
  for (const area of COMMON_AREAS) {
    await prisma.commonArea.upsert({
      where: { id: `${condominium.id}-${area.kind}` },
      update: {},
      create: {
        id: `${condominium.id}-${area.kind}`,
        condominiumId: condominium.id,
        name: area.name,
        kind: area.kind,
        capacity: area.capacity,
        fee: new Prisma.Decimal(area.fee),
        deposit: new Prisma.Decimal(area.deposit),
        autoApprove: area.autoApprove,
        slots: area.slots,
        openDays: area.openDays,
        rules: area.rules,
      },
    });
  }

  for (const [index, gate] of GATES.entries()) {
    await prisma.gate.upsert({
      where: { id: `${condominium.id}-gate-${index}` },
      update: {},
      create: {
        id: `${condominium.id}-gate-${index}`,
        condominiumId: condominium.id,
        name: gate.name,
        kind: gate.kind,
      },
    });
  }

  for (const [index, name] of CAMERAS.entries()) {
    await prisma.camera.upsert({
      where: { id: `${condominium.id}-cam-${index}` },
      update: {},
      create: {
        id: `${condominium.id}-cam-${index}`,
        condominiumId: condominium.id,
        name,
        location: name,
        channel: index + 1,
        online: index !== 11,
      },
    });
  }
  console.log(`  ${COMMON_AREAS.length} áreas comuns, ${GATES.length} portões, ${CAMERAS.length} câmeras`);

  // ---- Moradores ----
  const occupied = [...unitsByLabel.values()];
  const residentRows: Prisma.ResidentCreateManyInput[] = [];
  occupied.forEach((unit, index) => {
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i += 1) {
      const name = i === 0 ? unit.block === 'A' && unit.label === '1204' ? 'Carlos Almeida' : fullName() : fullName();
      residentRows.push({
        id: `${unit.id}-r${i}`,
        condominiumId: condominium.id,
        unitId: unit.id,
        name,
        document: cpf(),
        email: emailFor(name, index * 4 + i),
        phone: phone(),
        type: i === 0 ? 'proprietario' : rng.bool(0.7) ? 'dependente' : 'inquilino',
        isMainContact: i === 0,
        since: new Date(Date.UTC(rng.int(2016, 2025), rng.int(0, 11), rng.int(1, 28))),
      });
    }
  });
  await prisma.resident.createMany({ data: residentRows, skipDuplicates: true });
  console.log(`  ${residentRows.length} moradores`);

  // ---- Contas de acesso ----
  const demoUnit = unitsByLabel.get('A-1204')!;
  const passwordHash = await hash(process.env.SEED_PASSWORD ?? '123456');

  const accounts: {
    email: string; name: string; role: Prisma.UserCreateInput['role'];
    jobTitle?: string; unitId?: string;
  }[] = [
    { email: 'morador@myhome.test', name: 'Carlos Almeida', role: 'morador', unitId: demoUnit.id, jobTitle: 'Torre A · Apto 1204' },
    { email: 'portaria@myhome.test', name: 'Marcos Vieira', role: 'portaria', jobTitle: 'Porteiro · Turno 06h–18h' },
    { email: 'sindico@myhome.test', name: 'Helena Duarte', role: 'sindico', jobTitle: 'Síndica · mandato 2025–2027' },
    { email: 'admin@myhome.test', name: 'Ricardo Monteiro', role: 'administrador', jobTitle: 'Administrador' },
    { email: 'administradora@myhome.test', name: 'Beatriz Salgado', role: 'administradora', jobTitle: 'Meridian Administração' },
  ];

  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name, role: account.role, jobTitle: account.jobTitle, unitId: account.unitId },
      create: {
        tenantId: tenant.id,
        email: account.email,
        name: account.name,
        passwordHash,
        role: account.role,
        jobTitle: account.jobTitle,
        unitId: account.unitId,
        phone: phone(),
        // Senha padrão é senha conhecida: a conta nasce marcada para
        // troca obrigatória no primeiro acesso fora de demonstração.
        mustChangePassword: !DEMO,
      },
    });

    await prisma.membership.upsert({
      where: { userId_condominiumId: { userId: user.id, condominiumId: condominium.id } },
      update: {},
      create: { userId: user.id, condominiumId: condominium.id },
    });
  }
  console.log(`  ${accounts.length} contas de acesso`);

  // Vincula a conta do morador ao cadastro de morador da unidade.
  const carlos = await prisma.user.findUnique({ where: { email: 'morador@myhome.test' } });
  if (carlos) {
    await prisma.resident.updateMany({
      where: { unitId: demoUnit.id, isMainContact: true },
      data: { userId: carlos.id },
    });
  }

  if (DEMO) await seedDemoData(condominium.id);

  console.log('Semeadura concluída.');
}

/* ---------------- Dados de demonstração ---------------- */

const CARRIERS = ['Correios', 'Mercado Livre', 'Amazon', 'Shopee', 'iFood', 'Rappi', 'Loggi', 'Magalu'];
const PROFESSIONAL_MIX: { category: Prisma.ProfessionalCreateInput['category']; role: string; count: number }[] = [
  { category: 'eletrica', role: 'Eletricista', count: 5 },
  { category: 'hidraulica', role: 'Encanador', count: 5 },
  { category: 'reformas', role: 'Pedreiro', count: 4 },
  { category: 'limpeza', role: 'Diarista', count: 5 },
  { category: 'climatizacao', role: 'Técnico em refrigeração', count: 4 },
  { category: 'montagem', role: 'Montador de móveis', count: 3 },
  { category: 'chaveiro', role: 'Chaveiro', count: 3 },
  { category: 'pintura', role: 'Pintor', count: 3 },
  { category: 'tecnologia', role: 'Técnico em informática', count: 3 },
  { category: 'jardinagem', role: 'Jardineiro', count: 2 },
  { category: 'pet', role: 'Dog walker', count: 3 },
  { category: 'aulas', role: 'Professor particular', count: 3 },
  { category: 'mudancas', role: 'Carreto e mudanças', count: 2 },
  { category: 'dedetizacao', role: 'Dedetizador', count: 2 },
];

async function seedDemoData(condominiumId: string): Promise<void> {
  const units = await prisma.unit.findMany({
    where: { condominiumId },
    select: { id: true, block: true, label: true },
    take: 400,
  });
  const residents = await prisma.resident.findMany({
    where: { condominiumId, isMainContact: true },
    select: { id: true, unitId: true, name: true },
    take: 400,
  });
  const gate = await prisma.gate.findFirst({ where: { condominiumId, kind: 'principal' } });
  if (!gate) return;

  const today = new Date();
  const dateAt = (offsetDays: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };

  // Visitantes esperados
  const visitors: Prisma.VisitorCreateManyInput[] = residents.slice(0, 80).map((resident, i) => ({
    id: `demo-vis-${i}`,
    condominiumId,
    unitId: resident.unitId,
    residentId: resident.id,
    name: fullName(),
    document: cpf(),
    phone: phone(),
    kind: 'unica',
    category: rng.bool(0.7) ? 'visita' : 'prestador',
    status: 'aguardando',
    expectedDate: dateAt(rng.int(0, 3)),
    expectedTime: `${String(rng.int(8, 21)).padStart(2, '0')}:${rng.bool() ? '00' : '30'}`,
    code: `D${String(i).padStart(5, '0')}`,
    createdBy: resident.name,
  }));
  await prisma.visitor.createMany({ data: visitors, skipDuplicates: true });

  // Encomendas na portaria
  const deliveries: Prisma.DeliveryCreateManyInput[] = residents.slice(0, 85).map((resident, i) => ({
    id: `demo-del-${i}`,
    condominiumId,
    unitId: resident.unitId,
    residentId: resident.id,
    carrier: rng.pick(CARRIERS),
    trackingCode: `BR${rng.int(100000000, 999999999)}BR`,
    size: rng.bool(0.6) ? 'pequena' : rng.bool(0.7) ? 'media' : 'grande',
    status: 'notificada',
    shelf: `${rng.pick(['A', 'B', 'C'])}${rng.int(1, 4)}`,
    receivedBy: 'Marcos Vieira',
    requiresSignature: rng.bool(0.2),
  }));
  await prisma.delivery.createMany({ data: deliveries, skipDuplicates: true });

  // Chamados
  const TICKET_TITLES = [
    ['Infiltração no teto do banheiro', 'Hidráulica'],
    ['Lâmpada queimada no corredor', 'Elétrica'],
    ['Portão da garagem lento', 'Portões'],
    ['Barulho de obra fora do horário', 'Convivência'],
    ['Elevador social parando fora do nível', 'Elevadores'],
    ['Vazamento na área da piscina', 'Áreas comuns'],
  ];
  const tickets: Prisma.TicketCreateManyInput[] = Array.from({ length: 23 }, (_, i) => {
    const [title, category] = TICKET_TITLES[i % TICKET_TITLES.length]!;
    const unit = rng.pick(units);
    return {
      id: `demo-tkt-${i}`,
      condominiumId,
      unitId: unit.id,
      code: `CH-${String(i + 1).padStart(5, '0')}`,
      category: category!,
      location: `Torre ${unit.block} · ${rng.bool() ? `Apto ${unit.label}` : 'Área comum'}`,
      title: title!,
      description: `${title}. Registrado pelo aplicativo my Home.`,
      priority: rng.bool(0.2) ? 'alta' : rng.bool(0.7) ? 'normal' : 'baixa',
      status: rng.bool(0.4) ? 'em_andamento' : 'aberto',
      openedBy: fullName(),
    };
  });
  await prisma.ticket.createMany({ data: tickets, skipDuplicates: true });

  // Profissionais recomendados
  const professionals: Prisma.ProfessionalCreateManyInput[] = [];
  let seq = 0;
  for (const spec of PROFESSIONAL_MIX) {
    for (let i = 0; i < spec.count; i += 1) {
      seq += 1;
      const name = fullName();
      const recommended = rng.bool(0.42);
      professionals.push({
        id: `demo-prof-${seq}`,
        condominiumId,
        name,
        document: cpf(),
        company: rng.bool(0.55) ? `${name.split(' ')[0]} Serviços` : null,
        category: spec.category,
        specialties: [spec.role, 'Atendimento residencial'],
        phone: phone(),
        email: rng.bool(0.6) ? emailFor(name, seq) : null,
        bio: `${spec.role} com ${rng.int(4, 22)} anos de experiência. ${
          recommended
            ? 'Indicado pela administração após atendimentos recorrentes no condomínio.'
            : 'Cadastrado a partir da indicação de moradores.'
        }`,
        serviceArea: rng.pick(['Zona Sul e região', 'Toda a capital', 'Bairro e adjacências']),
        since: dateAt(-rng.int(200, 2000)),
        jobsInCondo: rng.int(3, 96),
        rating: new Prisma.Decimal((rng.int(39, 50) / 10).toFixed(2)),
        reviewsCount: rng.int(4, 38),
        priceFrom: rng.bool(0.75) ? new Prisma.Decimal(rng.int(80, 460)) : null,
        responseTime: rng.pick(['Responde em minutos', 'Responde em até 1 h', 'Responde no mesmo dia']),
        verified: rng.bool(0.72),
        recommendedByCondo: recommended,
        recommendedBy: recommended ? 'Helena Duarte · Síndica' : null,
        emergency: spec.category === 'chaveiro' || spec.category === 'hidraulica' ? rng.bool(0.6) : rng.bool(0.15),
      });
    }
  }
  await prisma.professional.createMany({ data: professionals, skipDuplicates: true });

  // Comunicados
  await prisma.announcement.createMany({
    data: [
      {
        id: 'demo-ann-1', condominiumId, title: 'Manutenção preventiva dos elevadores',
        body: 'Os elevadores da Torre A passarão por manutenção preventiva na próxima terça-feira, das 9h às 12h.',
        priority: 'importante', audienceKind: 'todos', audienceLabel: 'Todos os moradores', author: 'Helena Duarte · Síndica',
      },
      {
        id: 'demo-ann-2', condominiumId, title: 'Nova rotina de coleta seletiva',
        body: 'A coleta seletiva passa a ser recolhida às segundas, quartas e sextas. Use os contêineres identificados no subsolo.',
        priority: 'normal', audienceKind: 'todos', audienceLabel: 'Todos os moradores', author: 'Meridian Administração',
      },
      {
        id: 'demo-ann-3', condominiumId, title: 'Assembleia Geral Ordinária',
        body: 'Convocação para a Assembleia Geral Ordinária. A pauta completa está disponível em Documentos.',
        priority: 'urgente', audienceKind: 'todos', audienceLabel: 'Todos os moradores', author: 'Helena Duarte · Síndica',
        pinned: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log(
    `  Demonstração: ${visitors.length} visitantes, ${deliveries.length} encomendas, ` +
      `${tickets.length} chamados, ${professionals.length} profissionais`,
  );
}

main()
  .catch((error) => {
    console.error('Falha na semeadura:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
