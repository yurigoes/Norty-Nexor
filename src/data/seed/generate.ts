/* =========================================================
   my Home — Gerador do dataset de demonstração
   ---------------------------------------------------------
   Constrói o "Residencial Parque Central" completo a partir de
   uma semente fixa. Determinístico: o mesmo condomínio,
   os mesmos moradores e os mesmos números em qualquer máquina.
   ========================================================= */

import type {
  AccessLog, Announcement, Assembly, AuditEntry, Camera, CommonArea, CondoEvent, Condominium,
  Delivery, DeviceSession, DocumentFile, Gate, Incident, Invoice, LedgerEntry, MaintenanceOrder,
  MyHomeDatabase, Reservation, Resident, Staff, Tenant, Ticket, Tower, Unit, User, Vehicle, Visitor,
  AppNotification, Professional, ProfessionalCategory, ProfessionalReview, ServiceRequest,
} from '../types';
import {
  CARRIERS, COLORS, EXPENSE_CATEGORIES, INCIDENT_TITLES, MOTORCYCLES, PROFESSIONAL_CATALOG,
  REVENUE_CATEGORIES, REVIEW_COMMENTS_GOOD, REVIEW_COMMENTS_MIXED, Rng, SERVICE_COMPANIES,
  SERVICE_REQUEST_SUBJECTS, STAFF_ROLES_CONDO, STAFF_ROLES_UNIT, TICKET_CATEGORIES, TICKET_TITLES,
  VEHICLES, cpf, email, fullName, phone, plate, shortCode,
} from './random';

export const DB_VERSION = 1;
/* A semente é um valor arbitrário e permanece com o nome antigo de
   propósito: alterá-la reconstruiria outro condomínio, com outros
   moradores, placas e históricos. O rótulo não aparece na interface. */
export const SEED_KEY = 'nexor-parque-central';

/* ---------------- Helpers de data (sempre em horário local) ---------------- */

function pad(n: number) { return String(n).padStart(2, '0'); }

function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Instante de referência da geração. Registros de eventos que já
 * aconteceram (encomendas recebidas, acessos, chamados, auditoria) usam
 * `pastTime`, que nunca produz um horário no futuro — caso contrário a
 * demonstração exibiria uma encomenda "recebida" daqui a três horas.
 */
let genNow = new Date();
let genToday = new Date();

function pastTime(dayOffset: number, hour: number, minute: number): string {
  const d = shiftDays(genToday, dayOffset);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() > genNow.getTime()) d.setDate(d.getDate() - 1);
  return localIso(d);
}

/* ---------------- Constantes do condomínio demonstrativo ---------------- */

const TOWERS = [
  { key: 'A', name: 'Torre A — Aurora' },
  { key: 'B', name: 'Torre B — Boreal' },
  { key: 'C', name: 'Torre C — Cristal' },
  { key: 'D', name: 'Torre D — Diamante' },
];

const FLOORS = 26;
const UNITS_PER_FLOOR = 12;

const PORTFOLIO_CONDOS = [
  'Residencial Vista Alta', 'Condomínio Jardins do Lago', 'Edifício Solaris', 'Residencial Alto da Serra',
  'Parque das Águas', 'Condomínio Monte Verde', 'Residencial Aurora Boreal', 'Edifício Horizonte Sul',
  'Villa Toscana Residence', 'Residencial Terra Nova', 'Condomínio Porto Belo', 'Edifício Grand Plaza',
  'Residencial Bosque Real', 'Parque dos Ipês', 'Condomínio Riviera', 'Residencial Costa Azul',
  'Edifício Metropolitan', 'Residencial Vale do Sol', 'Condomínio Belvedere', 'Parque Central Norte',
  'Residencial Île de France', 'Edifício Skyline', 'Condomínio Reserva das Palmeiras',
];

/* =========================================================
   Gerador
   ========================================================= */

export function generateDatabase(now = new Date()): MyHomeDatabase {
  const rng = new Rng(SEED_KEY);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  genNow = new Date(now);
  genToday = today;

  const tenantId = 'tenant-meridian';
  const condoId = 'condo-parque-central';

  /* ---------- Administradora ---------- */
  const tenants: Tenant[] = [{
    id: tenantId,
    name: 'Meridian Administração',
    legalName: 'Meridian Administração Condominial Ltda.',
    document: '18.442.907/0001-56',
    logoInitials: 'MA',
    city: 'São Paulo',
    state: 'SP',
    plan: 'enterprise',
  }];

  /* ---------- Condomínio principal ---------- */
  const condominiums: Condominium[] = [{
    id: condoId,
    tenantId,
    name: 'Residencial Parque Central',
    shortName: 'Parque Central',
    address: 'Av. das Nações Unidas, 4.820',
    city: 'São Paulo',
    state: 'SP',
    zip: '04578-000',
    document: '09.317.554/0001-08',
    unitsCount: TOWERS.length * FLOORS * UNITS_PER_FLOOR,
    residentsCount: 2856,
    vehiclesCount: 734,
    staffCount: 86,
    towersCount: TOWERS.length,
    managerName: 'Helena Duarte',
    createdAt: '2019-03-12T09:00:00',
    metrics: {
      delinquencyRate: 4.8,
      openTickets: 23,
      accessesToday: 3842,
      occupancyRate: 92.4,
      monthlyRevenue: 1487320,
    },
  }];

  /* ---------- Portfólio da administradora (resumos) ---------- */
  PORTFOLIO_CONDOS.forEach((name, i) => {
    const units = rng.int(180, 1120);
    condominiums.push({
      id: `condo-p${i + 1}`,
      tenantId,
      name,
      shortName: name.replace(/^(Residencial|Condomínio|Edifício)\s+/, ''),
      address: `Rua ${rng.pick(['das Acácias', 'Bela Vista', 'dos Pinheiros', 'Santa Clara', 'do Comércio'])}, ${rng.int(100, 3200)}`,
      city: rng.pick(['São Paulo', 'Guarulhos', 'Osasco', 'Santo André', 'Barueri', 'Campinas']),
      state: 'SP',
      zip: `0${rng.int(1000, 9999)}-${rng.int(100, 999)}`,
      document: `${rng.int(10, 99)}.${rng.int(100, 999)}.${rng.int(100, 999)}/0001-${rng.int(10, 99)}`,
      unitsCount: units,
      residentsCount: Math.round(units * rng.float(2.1, 2.6)),
      vehiclesCount: Math.round(units * rng.float(0.5, 0.75)),
      staffCount: rng.int(12, 74),
      towersCount: rng.int(1, 6),
      managerName: fullName(rng),
      createdAt: `20${rng.int(15, 23)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}T09:00:00`,
      metrics: {
        delinquencyRate: rng.float(1.4, 11.8, 1),
        openTickets: rng.int(2, 41),
        accessesToday: rng.int(240, 4200),
        occupancyRate: rng.float(78, 99, 1),
        monthlyRevenue: units * rng.int(680, 1450),
      },
    });
  });

  /* ---------- Torres e unidades ---------- */
  const towers: Tower[] = TOWERS.map((t) => ({
    id: `tower-${t.key}`,
    condominiumId: condoId,
    name: t.name,
    floors: FLOORS,
    unitsPerFloor: UNITS_PER_FLOOR,
    unitsCount: FLOORS * UNITS_PER_FLOOR,
  }));

  const units: Unit[] = [];
  for (const tower of TOWERS) {
    for (let floor = 1; floor <= FLOORS; floor += 1) {
      for (let n = 1; n <= UNITS_PER_FLOOR; n += 1) {
        const label = `${floor}${pad(n)}`;
        const status = rng.weighted([
          ['ocupada' as const, 68], ['alugada' as const, 24], ['vaga' as const, 6], ['reformando' as const, 2],
        ]);
        const bedrooms = rng.weighted([[2, 34], [3, 46], [4, 20]]);
        const area = bedrooms === 2 ? rng.int(62, 78) : bedrooms === 3 ? rng.int(84, 112) : rng.int(126, 168);
        const spots = Array.from({ length: bedrooms === 4 ? 3 : bedrooms === 3 ? 2 : 1 }, (_, k) =>
          `${tower.key}${rng.int(1, 3)}-${pad(rng.int(1, 99))}${k > 0 ? 'B' : ''}`);
        units.push({
          id: `unit-${tower.key}-${label}`,
          condominiumId: condoId,
          towerId: `tower-${tower.key}`,
          label,
          floor,
          block: tower.key,
          bedrooms,
          area,
          status,
          ownerName: fullName(rng),
          parkingSpots: spots,
          monthlyFee: Math.round((760 + area * 6.4 + bedrooms * 48) / 10) * 10,
          delinquent: status !== 'vaga' && rng.bool(0.048),
        });
      }
    }
  }

  const unitById = new Map(units.map((u) => [u.id, u]));
  const occupiedUnits = units.filter((u) => u.status !== 'vaga');

  /* ---------- Unidade e morador de demonstração ---------- */
  const demoUnit = unitById.get('unit-A-1204')!;
  demoUnit.status = 'ocupada';
  demoUnit.ownerName = 'Carlos Almeida';
  demoUnit.bedrooms = 3;
  demoUnit.area = 98;
  demoUnit.parkingSpots = ['A2-118', 'A2-119'];
  demoUnit.monthlyFee = 1284.5;
  demoUnit.delinquent = false;

  /* ---------- Moradores ---------- */
  const residents: Resident[] = [];
  let residentSeq = 0;

  const demoResident: Resident = {
    id: 'res-demo-carlos',
    condominiumId: condoId,
    unitId: demoUnit.id,
    userId: 'user-morador',
    name: 'Carlos Almeida',
    document: '327.418.905-22',
    email: 'morador@myhome.test',
    phone: '(11) 98214-7730',
    type: 'proprietario',
    active: true,
    since: '2021-06-14',
    isMainContact: true,
  };
  residents.push(demoResident);

  residents.push({
    id: 'res-demo-juliana',
    condominiumId: condoId,
    unitId: demoUnit.id,
    name: 'Juliana Almeida',
    document: '448.902.371-04',
    email: 'juliana.almeida@gmail.com',
    phone: '(11) 99640-2218',
    type: 'proprietario',
    active: true,
    since: '2021-06-14',
    isMainContact: false,
  });

  residents.push({
    id: 'res-demo-pedro',
    condominiumId: condoId,
    unitId: demoUnit.id,
    name: 'Pedro Almeida',
    document: '712.338.440-91',
    email: 'pedro.almeida@icloud.com',
    phone: '(11) 97712-4408',
    type: 'dependente',
    active: true,
    since: '2021-06-14',
    isMainContact: false,
  });

  for (const unit of occupiedUnits) {
    if (unit.id === demoUnit.id) continue;
    const count = rng.weighted([[1, 22], [2, 40], [3, 26], [4, 12]]);
    for (let i = 0; i < count; i += 1) {
      residentSeq += 1;
      const name = i === 0 ? unit.ownerName : fullName(rng);
      residents.push({
        id: `res-${residentSeq}`,
        condominiumId: condoId,
        unitId: unit.id,
        name,
        document: cpf(rng),
        email: email(name, residentSeq),
        phone: phone(rng),
        type: i === 0 ? (unit.status === 'alugada' ? 'inquilino' : 'proprietario') : rng.weighted([['dependente', 70], ['proprietario', 30]]),
        active: rng.bool(0.97),
        since: `20${rng.int(19, 25)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`,
        isMainContact: i === 0,
      });
    }
  }

  /* ---------- Usuários (contas de demonstração) ---------- */
  const users: User[] = [
    {
      id: 'user-morador',
      name: 'Carlos Almeida',
      email: 'morador@myhome.test',
      password: '123456',
      role: 'morador',
      tenantId,
      condominiumIds: [condoId],
      unitId: demoUnit.id,
      residentId: demoResident.id,
      phone: '(11) 98214-7730',
      jobTitle: 'Proprietário · Torre A · Apto 1204',
      lastLoginAt: pastTime(-1, 21, 4),
    },
    {
      id: 'user-portaria',
      name: 'Marcos Vieira',
      email: 'portaria@myhome.test',
      password: '123456',
      role: 'portaria',
      tenantId,
      condominiumIds: [condoId],
      phone: '(11) 3555-4400',
      jobTitle: 'Porteiro · Portaria Principal · Turno 06h–18h',
      lastLoginAt: pastTime(0, 6, 2),
    },
    {
      id: 'user-sindico',
      name: 'Helena Duarte',
      email: 'sindico@myhome.test',
      password: '123456',
      role: 'sindico',
      tenantId,
      condominiumIds: [condoId],
      unitId: 'unit-C-1802',
      phone: '(11) 99120-3388',
      jobTitle: 'Síndica · Mandato 2025–2027',
      lastLoginAt: pastTime(0, 8, 41),
    },
    {
      id: 'user-admin',
      name: 'Ricardo Monteiro',
      email: 'admin@myhome.test',
      password: '123456',
      role: 'administrador',
      tenantId,
      condominiumIds: condominiums.map((c) => c.id),
      phone: '(11) 3120-9800',
      jobTitle: 'Gerente de operações · Meridian Administração',
      lastLoginAt: pastTime(0, 7, 55),
    },
    {
      id: 'user-administradora',
      name: 'Beatriz Salgado',
      email: 'administradora@myhome.test',
      password: '123456',
      role: 'administradora',
      tenantId,
      condominiumIds: [],
      phone: '(11) 3120-9801',
      jobTitle: 'Diretora de portfólio · Meridian Administração',
      lastLoginAt: pastTime(-1, 18, 12),
    },
  ];

  /* ---------- Áreas comuns ---------- */
  const commonAreas: CommonArea[] = [
    { id: 'area-salao', name: 'Salão de Festas', kind: 'salao_festas', capacity: 120, fee: 380, deposit: 500, autoApprove: false, slots: ['10:00–15:00', '16:00–22:00', '19:00–00:00'], rules: ['Uso permitido até as 00h', 'Devolução limpa em até 12h', 'Caução liberada em 5 dias úteis'], openDays: [0, 1, 2, 3, 4, 5, 6], active: true },
    { id: 'area-gourmet', name: 'Salão Gourmet', kind: 'salao_gourmet', capacity: 40, fee: 220, deposit: 300, autoApprove: false, slots: ['11:00–16:00', '17:00–23:00'], rules: ['Máximo de 40 convidados', 'Som ambiente até 22h'], openDays: [0, 1, 2, 3, 4, 5, 6], active: true },
    { id: 'area-churrasq1', name: 'Churrasqueira 01 — Deck', kind: 'churrasqueira', capacity: 20, fee: 90, deposit: 0, autoApprove: true, slots: ['11:00–16:00', '17:00–22:00'], rules: ['Carvão por conta do morador', 'Limpeza obrigatória'], openDays: [0, 1, 2, 3, 4, 5, 6], active: true },
    { id: 'area-churrasq2', name: 'Churrasqueira 02 — Jardim', kind: 'churrasqueira', capacity: 16, fee: 90, deposit: 0, autoApprove: true, slots: ['11:00–16:00', '17:00–22:00'], rules: ['Limpeza obrigatória'], openDays: [0, 1, 2, 3, 4, 5, 6], active: true },
    { id: 'area-academia', name: 'Academia', kind: 'academia', capacity: 24, fee: 0, deposit: 0, autoApprove: true, slots: ['06:00–08:00', '08:00–10:00', '18:00–20:00', '20:00–22:00'], rules: ['Uso de toalha obrigatório', 'Menores acompanhados'], openDays: [0, 1, 2, 3, 4, 5, 6], active: true },
    { id: 'area-piscina', name: 'Piscina Adulto', kind: 'piscina', capacity: 60, fee: 0, deposit: 0, autoApprove: true, slots: ['08:00–12:00', '13:00–18:00'], rules: ['Exame dermatológico em dia', 'Proibido vidro na área'], openDays: [0, 2, 3, 4, 5, 6], active: true },
    { id: 'area-brinquedoteca', name: 'Brinquedoteca', kind: 'brinquedoteca', capacity: 18, fee: 60, deposit: 0, autoApprove: true, slots: ['09:00–12:00', '14:00–18:00'], rules: ['Responsável presente'], openDays: [0, 1, 2, 3, 4, 5, 6], active: true },
    { id: 'area-quadra', name: 'Quadra Poliesportiva', kind: 'quadra', capacity: 22, fee: 0, deposit: 0, autoApprove: true, slots: ['07:00–09:00', '09:00–11:00', '16:00–18:00', '18:00–20:00', '20:00–22:00'], rules: ['Calçado apropriado'], openDays: [0, 1, 2, 3, 4, 5, 6], active: true },
    { id: 'area-coworking', name: 'Coworking', kind: 'coworking', capacity: 14, fee: 0, deposit: 0, autoApprove: true, slots: ['08:00–12:00', '13:00–17:00', '17:00–21:00'], rules: ['Silêncio nas cabines', 'Reserva máxima de 4h'], openDays: [1, 2, 3, 4, 5], active: true },
    { id: 'area-pet', name: 'Espaço Pet', kind: 'espaco_pet', capacity: 10, fee: 0, deposit: 0, autoApprove: true, slots: ['07:00–10:00', '16:00–20:00'], rules: ['Coleira obrigatória na chegada', 'Recolher dejetos'], openDays: [0, 1, 2, 3, 4, 5, 6], active: true },
  ].map((a) => ({ ...a, condominiumId: condoId })) as CommonArea[];

  /* ---------- Portões e câmeras ---------- */
  const gates: Gate[] = [
    { id: 'gate-principal', condominiumId: condoId, name: 'Portão Principal', kind: 'principal', status: 'online', lastOpenedAt: pastTime(0, 10, 42), lastOpenedBy: 'Marcos Vieira' },
    { id: 'gate-garagem', condominiumId: condoId, name: 'Portão Garagem', kind: 'garagem', status: 'online', lastOpenedAt: pastTime(0, 10, 45), lastOpenedBy: 'Leitura de placa' },
    { id: 'gate-servico', condominiumId: condoId, name: 'Portão de Serviço', kind: 'servico', status: 'online', lastOpenedAt: pastTime(0, 9, 18), lastOpenedBy: 'Ana Paula Reis' },
    { id: 'gate-pedestre', condominiumId: condoId, name: 'Acesso Pedestres', kind: 'pedestre', status: 'manutencao', lastOpenedAt: pastTime(-1, 17, 3), lastOpenedBy: 'Marcos Vieira' },
  ];

  const CAMERA_SPOTS = [
    'Portaria Principal', 'Hall Torre A', 'Hall Torre B', 'Hall Torre C', 'Hall Torre D',
    'Garagem — Subsolo 1', 'Garagem — Subsolo 2', 'Área de Lazer', 'Piscina', 'Playground',
    'Portão de Serviço', 'Perímetro Norte',
  ];
  const cameras: Camera[] = CAMERA_SPOTS.map((location, i) => ({
    id: `cam-${pad(i + 1)}`,
    condominiumId: condoId,
    name: `CAM ${pad(i + 1)}`,
    location,
    status: i === 6 ? 'offline' : 'online',
    hasMotion: rng.bool(0.35),
    channel: i + 1,
  }));

  /* ---------- Veículos ---------- */
  const vehicles: Vehicle[] = [];
  const demoVehicles: Vehicle[] = [
    {
      id: 'veh-demo-1', condominiumId: condoId, unitId: demoUnit.id, ownerId: demoResident.id,
      ownerName: 'Carlos Almeida', ownerKind: 'morador', plate: 'ABC1D23', brand: 'Volvo', model: 'XC40 Recharge',
      color: 'Grafite', kind: 'carro', parkingSpot: 'A2-118', authorized: true, createdAt: '2023-02-11T10:00:00',
    },
    {
      id: 'veh-demo-2', condominiumId: condoId, unitId: demoUnit.id, ownerId: 'res-demo-juliana',
      ownerName: 'Juliana Almeida', ownerKind: 'morador', plate: 'RFT4J81', brand: 'Toyota', model: 'Corolla Cross',
      color: 'Prata', kind: 'carro', parkingSpot: 'A2-119', authorized: true, createdAt: '2024-08-30T10:00:00',
    },
  ];
  vehicles.push(...demoVehicles);

  const vehicleUnits = rng.sample(occupiedUnits.filter((u) => u.id !== demoUnit.id), 732);
  vehicleUnits.forEach((unit, i) => {
    const isMoto = rng.bool(0.12);
    const [brand, model] = isMoto ? rng.pick(MOTORCYCLES) : rng.pick(VEHICLES);
    const owner = residents.find((r) => r.unitId === unit.id);
    vehicles.push({
      id: `veh-${i + 1}`,
      condominiumId: condoId,
      unitId: unit.id,
      ownerId: owner?.id,
      ownerName: owner?.name ?? unit.ownerName,
      ownerKind: 'morador',
      plate: plate(rng),
      brand,
      model,
      color: rng.pick(COLORS),
      kind: isMoto ? 'moto' : rng.weighted([['carro', 88], ['utilitario', 12]]),
      parkingSpot: unit.parkingSpots[0],
      authorized: rng.bool(0.985),
      createdAt: pastTime(-rng.int(30, 900), rng.int(8, 19), rng.int(0, 59)),
    });
  });

  /* ---------- Funcionários e prestadores ---------- */
  const staff: Staff[] = [];

  staff.push({
    id: 'staff-demo-maria',
    condominiumId: condoId,
    unitId: demoUnit.id,
    name: 'Maria Santos',
    document: '509.221.874-30',
    role: 'Funcionária doméstica',
    phone: '(11) 98833-1207',
    kind: 'funcionario_unidade',
    workDays: [1, 3, 5],
    shiftStart: '08:00',
    shiftEnd: '16:00',
    active: true,
    admittedAt: '2022-09-05',
  });

  for (let i = 0; i < 86; i += 1) {
    const name = fullName(rng);
    staff.push({
      id: `staff-condo-${i + 1}`,
      condominiumId: condoId,
      name,
      document: cpf(rng),
      role: rng.pick(STAFF_ROLES_CONDO),
      company: rng.bool(0.3) ? rng.pick(SERVICE_COMPANIES) : undefined,
      phone: phone(rng),
      kind: 'funcionario_condominio',
      workDays: rng.bool(0.6) ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
      shiftStart: rng.pick(['06:00', '07:00', '08:00', '14:00', '18:00']),
      shiftEnd: rng.pick(['14:00', '16:00', '18:00', '22:00', '06:00']),
      active: rng.bool(0.96),
      admittedAt: `20${rng.int(17, 25)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`,
    });
  }

  const staffUnits = rng.sample(occupiedUnits.filter((u) => u.id !== demoUnit.id), 214);
  staffUnits.forEach((unit, i) => {
    const name = fullName(rng);
    staff.push({
      id: `staff-unit-${i + 1}`,
      condominiumId: condoId,
      unitId: unit.id,
      name,
      document: cpf(rng),
      role: rng.pick(STAFF_ROLES_UNIT),
      phone: phone(rng),
      kind: 'funcionario_unidade',
      workDays: rng.sample([1, 2, 3, 4, 5], rng.int(2, 5)).sort(),
      shiftStart: rng.pick(['07:00', '08:00', '09:00', '13:00']),
      shiftEnd: rng.pick(['15:00', '16:00', '17:00', '18:00']),
      active: rng.bool(0.93),
      admittedAt: `20${rng.int(20, 26)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`,
    });
  });

  for (let i = 0; i < 34; i += 1) {
    const name = fullName(rng);
    staff.push({
      id: `staff-prov-${i + 1}`,
      condominiumId: condoId,
      name,
      document: cpf(rng),
      role: rng.pick(['Técnico de manutenção', 'Eletricista', 'Encanador', 'Técnico de elevadores', 'Dedetizador', 'Pintor']),
      company: rng.pick(SERVICE_COMPANIES),
      phone: phone(rng),
      kind: 'prestador',
      workDays: rng.sample([1, 2, 3, 4, 5], rng.int(1, 3)).sort(),
      shiftStart: '08:00',
      shiftEnd: '17:00',
      accessValidUntil: localDate(shiftDays(today, rng.int(5, 180))),
      active: true,
      admittedAt: `202${rng.int(4, 6)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`,
    });
  }

  /* ---------- Eventos ---------- */
  const events: CondoEvent[] = [{
    id: 'event-demo-1',
    condominiumId: condoId,
    unitId: demoUnit.id,
    residentId: demoResident.id,
    title: 'Festa de aniversário — Pedro',
    date: localDate(shiftDays(today, 4)),
    startTime: '19:00',
    endTime: '00:00',
    expectedGuests: 30,
    areaId: 'area-salao',
    status: 'planejado',
    createdAt: pastTime(-6, 20, 15),
    inviteCode: 'NX-EVT-4821',
  }];

  /* ---------- Visitantes ---------- */
  const visitors: Visitor[] = [];
  let visitorSeq = 0;

  const pushVisitor = (v: Omit<Visitor, 'id' | 'condominiumId'>) => {
    visitorSeq += 1;
    visitors.push({ id: `vis-${visitorSeq}`, condominiumId: condoId, ...v });
    return visitors[visitors.length - 1];
  };

  // Visitantes da unidade de demonstração — usados no roteiro do MVP
  pushVisitor({
    unitId: demoUnit.id, residentId: demoResident.id, name: 'João da Silva', document: '284.771.330-19',
    phone: '(11) 99117-4402', kind: 'unica', status: 'aguardando', expectedDate: localDate(today),
    expectedTime: '14:30', category: 'visita', code: 'NX-8FQ2K1', createdAt: pastTime(0, 9, 12),
    createdBy: 'Carlos Almeida', notes: 'Amigo da família. Subir direto.',
  });
  pushVisitor({
    unitId: demoUnit.id, residentId: demoResident.id, name: 'Bianca Ferreira', document: '661.204.887-45',
    phone: '(11) 98410-2277', kind: 'temporaria', status: 'aguardando', expectedDate: localDate(today),
    expectedTime: '17:00', validUntil: localDate(shiftDays(today, 3)), category: 'visita',
    code: 'NX-P3RM09', createdAt: pastTime(-1, 19, 40), createdBy: 'Juliana Almeida',
  });
  pushVisitor({
    unitId: demoUnit.id, residentId: demoResident.id, name: 'Anderson Luz', document: '118.930.552-77',
    phone: '(11) 97220-8813', kind: 'recorrente', status: 'aguardando', expectedDate: localDate(today),
    expectedTime: '09:00', recurrenceDays: [2, 4], validUntil: localDate(shiftDays(today, 60)),
    category: 'prestador', companyName: 'AquaClean Piscinas', code: 'NX-RC7742',
    createdAt: pastTime(-22, 11, 5), createdBy: 'Carlos Almeida',
  });

  // Convidados do evento
  const eventGuests = ['Rafael Nogueira', 'Tatiane Prado', 'Luiz Fernando Ramos', 'Camila Duarte', 'Otávio Bastos'];
  eventGuests.forEach((name) => {
    pushVisitor({
      unitId: demoUnit.id, residentId: demoResident.id, name, document: cpf(rng),
      kind: 'unica', status: 'aguardando', expectedDate: events[0].date, expectedTime: '19:00',
      category: 'convidado_evento', eventId: events[0].id, code: shortCode(rng, 'NX'),
      createdAt: pastTime(-5, 21, rng.int(0, 59)), createdBy: 'Carlos Almeida',
    });
  });

  // Visitantes esperados hoje em todo o condomínio (127 no total)
  const otherUnits = rng.sample(occupiedUnits.filter((u) => u.id !== demoUnit.id), 124);
  otherUnits.forEach((unit) => {
    const main = residents.find((r) => r.unitId === unit.id);
    const hour = rng.int(8, 21);
    pushVisitor({
      unitId: unit.id,
      residentId: main?.id ?? 'res-1',
      name: fullName(rng),
      document: cpf(rng),
      phone: phone(rng),
      kind: rng.weighted([['unica', 74], ['temporaria', 14], ['recorrente', 9], ['permanente', 3]]),
      status: rng.weighted([['aguardando', 62], ['no_local', 14], ['finalizado', 22], ['revogado', 2]]),
      expectedDate: localDate(today),
      expectedTime: `${pad(hour)}:${rng.pick(['00', '15', '30', '45'])}`,
      category: rng.weighted([['visita', 66], ['prestador', 20], ['entrega', 14]]),
      companyName: rng.bool(0.25) ? rng.pick(SERVICE_COMPANIES) : undefined,
      vehiclePlate: rng.bool(0.4) ? plate(rng) : undefined,
      code: shortCode(rng, 'NX'),
      createdAt: pastTime(-rng.int(0, 3), rng.int(7, 22), rng.int(0, 59)),
      createdBy: main?.name ?? 'Morador',
    });
  });

  // Histórico dos últimos 10 dias
  for (let d = 1; d <= 10; d += 1) {
    const sample = rng.sample(occupiedUnits, 46);
    sample.forEach((unit) => {
      const main = residents.find((r) => r.unitId === unit.id);
      const hour = rng.int(8, 21);
      pushVisitor({
        unitId: unit.id,
        residentId: main?.id ?? 'res-1',
        name: fullName(rng),
        document: cpf(rng),
        kind: 'unica',
        status: rng.weighted([['finalizado', 88], ['expirado', 10], ['revogado', 2]]),
        expectedDate: localDate(shiftDays(today, -d)),
        expectedTime: `${pad(hour)}:00`,
        category: rng.weighted([['visita', 70], ['prestador', 18], ['entrega', 12]]),
        code: shortCode(rng, 'NX'),
        createdAt: pastTime(-d, rng.int(7, 20), rng.int(0, 59)),
        createdBy: main?.name ?? 'Morador',
        checkInAt: pastTime(-d, hour, rng.int(0, 30)),
        checkOutAt: pastTime(-d, Math.min(23, hour + rng.int(1, 4)), rng.int(0, 59)),
      });
    });
  }

  return assemble({
    now, today, rng, tenantId, condoId, tenants, condominiums, towers, units, residents, users,
    commonAreas, gates, cameras, visitors, staff, vehicles, events, demoUnit, demoResident,
    occupiedUnits, unitById,
  });
}

/* =========================================================
   Segunda metade: operação (acessos, encomendas, reservas,
   financeiro, chamados, ocorrências, comunicação, governança)
   ========================================================= */

interface AssembleInput {
  now: Date; today: Date; rng: Rng; tenantId: string; condoId: string;
  tenants: Tenant[]; condominiums: Condominium[]; towers: Tower[]; units: Unit[];
  residents: Resident[]; users: User[]; commonAreas: CommonArea[]; gates: Gate[]; cameras: Camera[];
  visitors: Visitor[]; staff: Staff[]; vehicles: Vehicle[]; events: CondoEvent[];
  demoUnit: Unit; demoResident: Resident; occupiedUnits: Unit[]; unitById: Map<string, Unit>;
}

function assemble(input: AssembleInput): MyHomeDatabase {
  const {
    rng, condoId, tenants, condominiums, towers, units, residents, users, commonAreas,
    gates, cameras, visitors, staff, vehicles, events, demoUnit, demoResident, occupiedUnits,
  } = input;

  const accessLogs = buildAccessLogs(input);
  const deliveries = buildDeliveries(input);
  const reservations = buildReservations(input);
  const { invoices, ledger } = buildFinance(input);
  const tickets = buildTickets(input);
  const incidents = buildIncidents(input);
  const maintenance = buildMaintenance(input);
  const announcements = buildAnnouncements(input);
  const documents = buildDocuments(input);
  const assemblies = buildAssemblies(input);
  const notifications = buildNotifications({ ...input, deliveries, invoices, reservations, tickets });
  const audit = buildAudit(input);
  const { professionals, professionalReviews, serviceRequests } = buildProfessionals(input);

  const sessions: DeviceSession[] = [
    { id: 'sess-1', userId: 'user-morador', device: 'iPhone 15 Pro', browser: 'my Home App', location: 'São Paulo, SP', lastActiveAt: localIso(new Date()), current: true },
    { id: 'sess-2', userId: 'user-morador', device: 'MacBook Air', browser: 'Safari 18', location: 'São Paulo, SP', lastActiveAt: pastTime(-2, 22, 14), current: false },
    { id: 'sess-3', userId: 'user-morador', device: 'iPad Air', browser: 'my Home App', location: 'Campos do Jordão, SP', lastActiveAt: pastTime(-11, 9, 30), current: false },
  ];

  void tenants; void towers; void units; void residents; void users; void commonAreas;
  void gates; void cameras; void visitors; void staff; void vehicles; void events;
  void demoUnit; void demoResident; void occupiedUnits; void rng; void condoId;

  return {
    version: DB_VERSION,
    createdAt: localIso(new Date()),
    tenants, condominiums, towers, units, residents, users, commonAreas, gates, cameras,
    visitors, staff, vehicles, accessLogs, deliveries, reservations, events, invoices, ledger,
    tickets, incidents, maintenance, announcements, documents, assemblies, notifications,
    audit, sessions, professionals, professionalReviews, serviceRequests,
  };
}

/* ---------------- Acessos ---------------- */

/** Curva de movimento típica de um condomínio residencial (peso por hora). */
const HOUR_WEIGHTS = [
  0.4, 0.2, 0.15, 0.15, 0.3, 1.2, 3.5, 6.5, 8.0, 6.5, 5.5, 5.0,
  5.5, 5.0, 5.0, 5.5, 6.0, 7.5, 8.5, 7.0, 5.0, 3.5, 2.0, 1.0,
];

function buildAccessLogs({ now, rng, condoId, residents, vehicles, staff, visitors, gates, demoUnit }: AssembleInput): AccessLog[] {
  const logs: AccessLog[] = [];
  let seq = 0;
  const totalWeight = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  const DAILY_TARGET = 4000;
  const porters = ['Marcos Vieira', 'Ana Paula Reis', 'Jorge Tavares', 'Sandra Lopes'];

  const residentPool = rng.sample(residents, 600);
  const vehiclePool = rng.sample(vehicles, 500);
  const staffPool = rng.sample(staff, 180);
  const visitorPool = visitors.filter((v) => v.status === 'finalizado' || v.status === 'no_local');

  for (let dayOffset = -2; dayOffset <= 0; dayOffset += 1) {
    const isToday = dayOffset === 0;
    const limitHour = isToday ? now.getHours() : 23;

    for (let hour = 0; hour <= limitHour; hour += 1) {
      // A hora corrente ainda não terminou: gera apenas a fração já decorrida,
      // senão o volume de uma hora inteira ficaria comprimido em poucos minutos.
      const elapsed = isToday && hour === limitHour ? Math.max(1, now.getMinutes()) / 60 : 1;
      const count = Math.round(
        (HOUR_WEIGHTS[hour] / totalWeight) * DAILY_TARGET * elapsed * (isToday ? 1 : rng.float(0.9, 1.08, 3)),
      );
      for (let i = 0; i < count; i += 1) {
        const minute = isToday && hour === limitHour ? rng.int(0, Math.max(0, now.getMinutes())) : rng.int(0, 59);
        const subjectType = rng.weighted<AccessLog['subjectType']>([
          ['morador', 44], ['veiculo', 31], ['visitante', 10], ['funcionario', 8], ['prestador', 4], ['entrega', 3],
        ]);
        let subjectName = '';
        let plateValue: string | undefined;
        let unitId: string | undefined;
        let subjectId: string | undefined;
        let method: AccessLog['method'] = 'manual';
        let gate = gates[0];

        switch (subjectType) {
          case 'morador': {
            const r = rng.pick(residentPool);
            subjectName = r.name; unitId = r.unitId; subjectId = r.id;
            method = rng.weighted([['tag', 62], ['biometria', 24], ['manual', 14]]);
            gate = rng.weighted([[gates[0], 70], [gates[3], 30]]);
            break;
          }
          case 'veiculo': {
            const v = rng.pick(vehiclePool);
            subjectName = `${v.brand} ${v.model}`; plateValue = v.plate; unitId = v.unitId; subjectId = v.id;
            method = 'placa'; gate = gates[1];
            break;
          }
          case 'visitante': {
            const v = visitorPool.length ? rng.pick(visitorPool) : null;
            subjectName = v?.name ?? 'Visitante'; unitId = v?.unitId; subjectId = v?.id;
            method = rng.weighted([['qrcode', 45], ['manual', 55]]);
            gate = gates[0];
            break;
          }
          case 'funcionario': {
            const s = rng.pick(staffPool);
            subjectName = s.name; unitId = s.unitId; subjectId = s.id;
            method = rng.weighted([['biometria', 60], ['manual', 40]]);
            gate = rng.weighted([[gates[2], 78], [gates[0], 22]]);
            break;
          }
          case 'prestador': {
            const s = rng.pick(staffPool);
            subjectName = s.name; subjectId = s.id; method = 'manual'; gate = gates[2];
            break;
          }
          default: {
            subjectName = rng.pick(CARRIERS); method = 'manual'; gate = gates[2];
          }
        }

        seq += 1;
        logs.push({
          id: `acc-${seq}`,
          condominiumId: condoId,
          unitId,
          subjectType,
          subjectId,
          subjectName,
          direction: rng.bool(0.5) ? 'entrada' : 'saida',
          gateId: gate.id,
          gateName: gate.name,
          plate: plateValue,
          at: pastTime(dayOffset, hour, minute),
          registeredBy: method === 'manual' ? rng.pick(porters) : 'Sistema my Home',
          method,
          authorized: rng.bool(0.994),
        });
      }
    }
  }

  // Acessos garantidos da unidade de demonstração (roteiro do MVP)
  const demoAccesses: Omit<AccessLog, 'id' | 'condominiumId'>[] = [
    { unitId: demoUnit.id, subjectType: 'morador', subjectName: 'Carlos Almeida', direction: 'saida', gateId: 'gate-garagem', gateName: 'Portão Garagem', plate: 'ABC1D23', at: pastTime(0, 7, 48), registeredBy: 'Sistema my Home', method: 'placa', authorized: true },
    { unitId: demoUnit.id, subjectType: 'funcionario', subjectName: 'Maria Santos', direction: 'entrada', gateId: 'gate-servico', gateName: 'Portão de Serviço', at: pastTime(0, 8, 2), registeredBy: 'Ana Paula Reis', method: 'biometria', authorized: true },
    { unitId: demoUnit.id, subjectType: 'entrega', subjectName: 'Mercado Livre', direction: 'entrada', gateId: 'gate-servico', gateName: 'Portão de Serviço', at: pastTime(0, 9, 26), registeredBy: 'Marcos Vieira', method: 'manual', authorized: true },
    { unitId: demoUnit.id, subjectType: 'morador', subjectName: 'Juliana Almeida', direction: 'entrada', gateId: 'gate-garagem', gateName: 'Portão Garagem', plate: 'RFT4J81', at: pastTime(0, 9, 55), registeredBy: 'Sistema my Home', method: 'placa', authorized: true },
  ];
  demoAccesses.forEach((a, i) => logs.push({ id: `acc-demo-${i + 1}`, condominiumId: condoId, ...a }));

  return logs.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/* ---------------- Encomendas ---------------- */

const SHELVES = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'D1', 'D2'];

function buildDeliveries({ rng, condoId, occupiedUnits, residents, demoUnit, demoResident }: AssembleInput): Delivery[] {
  const deliveries: Delivery[] = [];
  const porters = ['Marcos Vieira', 'Ana Paula Reis', 'Jorge Tavares'];

  deliveries.push({
    id: 'del-demo-1', condominiumId: condoId, unitId: demoUnit.id, residentId: demoResident.id,
    carrier: 'Mercado Livre', trackingCode: 'ML4471209BR', size: 'media', status: 'notificada',
    receivedAt: pastTime(0, 9, 26), receivedBy: 'Marcos Vieira', shelf: 'A2', requiresSignature: false,
  });
  deliveries.push({
    id: 'del-demo-2', condominiumId: condoId, unitId: demoUnit.id, residentId: demoResident.id,
    carrier: 'Amazon', trackingCode: 'AMZ88320174', size: 'pequena', status: 'notificada',
    receivedAt: pastTime(-1, 16, 4), receivedBy: 'Ana Paula Reis', shelf: 'A1', requiresSignature: false,
  });
  deliveries.push({
    id: 'del-demo-3', condominiumId: condoId, unitId: demoUnit.id, residentId: demoResident.id,
    carrier: 'Correios', trackingCode: 'BR772109883SP', size: 'pequena', status: 'retirada',
    receivedAt: pastTime(-6, 11, 12), receivedBy: 'Jorge Tavares', shelf: 'B2',
    pickedUpAt: pastTime(-6, 19, 33), pickedUpBy: 'Carlos Almeida', requiresSignature: true,
  });

  const pendingUnits = rng.sample(occupiedUnits.filter((u) => u.id !== demoUnit.id), 82);
  pendingUnits.forEach((unit, i) => {
    const dayOffset = -rng.int(0, 2);
    deliveries.push({
      id: `del-${i + 1}`,
      condominiumId: condoId,
      unitId: unit.id,
      residentId: residents.find((r) => r.unitId === unit.id)?.id,
      carrier: rng.pick(CARRIERS),
      trackingCode: `${shortCode(rng)}${rng.int(1000, 9999)}BR`,
      size: rng.weighted([['pequena', 52], ['media', 36], ['grande', 12]]),
      status: rng.weighted([['notificada', 74], ['recebida', 26]]),
      receivedAt: pastTime(dayOffset, rng.int(8, 20), rng.int(0, 59)),
      receivedBy: rng.pick(porters),
      shelf: rng.pick(SHELVES),
      requiresSignature: rng.bool(0.18),
    });
  });

  for (let d = 1; d <= 12; d += 1) {
    const sample = rng.sample(occupiedUnits, 22);
    sample.forEach((unit, i) => {
      const received = pastTime(-d, rng.int(8, 19), rng.int(0, 59));
      deliveries.push({
        id: `del-h${d}-${i}`,
        condominiumId: condoId,
        unitId: unit.id,
        carrier: rng.pick(CARRIERS),
        trackingCode: `${shortCode(rng)}${rng.int(1000, 9999)}BR`,
        size: rng.weighted([['pequena', 55], ['media', 34], ['grande', 11]]),
        status: rng.weighted([['retirada', 94], ['devolvida', 6]]),
        receivedAt: received,
        receivedBy: rng.pick(porters),
        shelf: rng.pick(SHELVES),
        pickedUpAt: pastTime(-d + (rng.bool(0.7) ? 0 : 1), rng.int(18, 22), rng.int(0, 59)),
        pickedUpBy: residents.find((r) => r.unitId === unit.id)?.name ?? unit.ownerName,
        requiresSignature: rng.bool(0.15),
      });
    });
  }

  return deliveries.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
}

/* ---------------- Reservas ---------------- */

function buildReservations({ today, rng, condoId, commonAreas, occupiedUnits, residents, demoUnit, demoResident }: AssembleInput): Reservation[] {
  const reservations: Reservation[] = [];
  let seq = 0;

  const push = (r: Omit<Reservation, 'id' | 'condominiumId'>) => {
    seq += 1;
    reservations.push({ id: `resv-${seq}`, condominiumId: condoId, ...r });
  };

  // Reserva do salão para o evento do morador de demonstração
  push({
    areaId: 'area-salao', unitId: demoUnit.id, residentId: demoResident.id, residentName: 'Carlos Almeida',
    date: localDate(shiftDays(today, 4)), slot: '19:00–00:00', guests: 30, status: 'confirmada', fee: 380,
    createdAt: pastTime(-6, 20, 15), notes: 'Festa de aniversário do Pedro.', eventId: 'event-demo-1',
  });
  push({
    areaId: 'area-churrasq1', unitId: demoUnit.id, residentId: demoResident.id, residentName: 'Carlos Almeida',
    date: localDate(shiftDays(today, -18)), slot: '11:00–16:00', guests: 12, status: 'concluida', fee: 90,
    createdAt: pastTime(-25, 10, 2),
  });

  for (let dayOffset = -20; dayOffset <= 45; dayOffset += 1) {
    const perDay = dayOffset === 0 ? 30 : rng.int(4, 22);
    const weekday = shiftDays(today, dayOffset).getDay();
    for (let i = 0; i < perDay; i += 1) {
      const area = rng.pick(commonAreas);
      // Respeita os dias de funcionamento da área: o calendário bloqueia
      // esses dias, então o seed não pode criar reservas neles.
      if (!area.openDays.includes(weekday)) continue;
      const unit = rng.pick(occupiedUnits);
      const resident = residents.find((r) => r.unitId === unit.id);
      const status: Reservation['status'] = dayOffset < 0
        ? rng.weighted([['concluida', 90], ['cancelada', 10]])
        : area.autoApprove
          ? rng.weighted([['confirmada', 94], ['cancelada', 6]])
          : rng.weighted([['confirmada', 62], ['pendente', 30], ['recusada', 8]]);
      push({
        areaId: area.id,
        unitId: unit.id,
        residentId: resident?.id ?? 'res-1',
        residentName: resident?.name ?? unit.ownerName,
        date: localDate(shiftDays(today, dayOffset)),
        slot: rng.pick(area.slots),
        guests: rng.int(2, Math.max(3, Math.round(area.capacity * 0.7))),
        status,
        fee: area.fee,
        createdAt: pastTime(dayOffset - rng.int(2, 20), rng.int(8, 22), rng.int(0, 59)),
      });
    }
  }

  return reservations;
}

/* ---------------- Financeiro ---------------- */

function buildFinance({ today, rng, condoId, units, demoUnit }: AssembleInput): { invoices: Invoice[]; ledger: LedgerEntry[] } {
  const invoices: Invoice[] = [];
  const ledger: LedgerEntry[] = [];
  let seq = 0;

  const monthRef = (offset: number) => {
    const d = new Date(today);
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d;
  };

  const buildItems = (unit: Unit) => ([
    { label: 'Taxa condominial', amount: Number((unit.monthlyFee * 0.78).toFixed(2)) },
    { label: 'Fundo de reserva', amount: Number((unit.monthlyFee * 0.1).toFixed(2)) },
    { label: 'Consumo de água', amount: Number((unit.monthlyFee * 0.09).toFixed(2)) },
    { label: 'Fundo de obras', amount: Number((unit.monthlyFee * 0.03).toFixed(2)) },
  ]);

  const makeInvoice = (unit: Unit, offset: number, forcedStatus?: Invoice['status']): Invoice => {
    const ref = monthRef(offset);
    const due = new Date(ref);
    due.setDate(10);
    const overdue = due < today;
    seq += 1;
    const status: Invoice['status'] = forcedStatus
      ?? (overdue ? (unit.delinquent && offset >= -1 ? 'vencido' : 'pago') : 'aberto');
    return {
      id: `inv-${seq}`,
      condominiumId: condoId,
      unitId: unit.id,
      reference: `${pad(ref.getMonth() + 1)}/${ref.getFullYear()}`,
      dueDate: localDate(due),
      amount: unit.monthlyFee,
      status,
      paidAt: status === 'pago' ? localDate(shiftDays(due, -rng.int(0, 6))) : undefined,
      barcode: `${rng.int(10000, 99999)}.${rng.int(10000, 99999)} ${rng.int(10000, 99999)}.${rng.int(100000, 999999)} ${rng.int(10000, 99999)}.${rng.int(100000, 999999)} ${rng.int(1, 9)} ${rng.int(10000000000, 99999999999)}`,
      items: buildItems(unit),
    };
  };

  for (const unit of units) {
    if (unit.status === 'vaga') continue;
    invoices.push(makeInvoice(unit, 0));
    invoices.push(makeInvoice(unit, -1));
  }

  // Histórico estendido da unidade de demonstração
  for (let offset = -2; offset >= -7; offset -= 1) {
    invoices.push(makeInvoice(demoUnit, offset, 'pago'));
  }
  // Próximo vencimento do morador de demonstração
  invoices.push(makeInvoice(demoUnit, 1, 'aberto'));

  // Livro-caixa dos últimos 8 meses
  let ledgerSeq = 0;
  for (let offset = -7; offset <= 0; offset += 1) {
    const ref = monthRef(offset);
    REVENUE_CATEGORIES.forEach((category) => {
      ledgerSeq += 1;
      const base = category === 'Taxa condominial' ? 1380000 : category === 'Fundo de reserva' ? 96000 : rng.int(3000, 28000);
      ledger.push({
        id: `led-${ledgerSeq}`,
        condominiumId: condoId,
        kind: 'receita',
        category,
        description: `${category} — competência ${pad(ref.getMonth() + 1)}/${ref.getFullYear()}`,
        amount: Math.round(base * rng.float(0.94, 1.06, 3)),
        date: localDate(new Date(ref.getFullYear(), ref.getMonth(), rng.int(5, 15))),
        status: offset === 0 ? 'pendente' : 'pago',
      });
    });
    EXPENSE_CATEGORIES.forEach((category) => {
      ledgerSeq += 1;
      const base: Record<string, number> = {
        'Folha de pagamento': 486000, 'Energia elétrica': 128000, 'Água e esgoto': 96000,
        'Manutenção predial': 74000, 'Limpeza e conservação': 68000, 'Segurança': 112000,
        'Elevadores': 42000, 'Seguro predial': 18000, 'Administração': 36000,
        'Jardinagem': 14000, 'Materiais': 22000, 'Internet e telefonia': 9000,
      };
      ledger.push({
        id: `led-${ledgerSeq}`,
        condominiumId: condoId,
        kind: 'despesa',
        category,
        description: `${category} — ${pad(ref.getMonth() + 1)}/${ref.getFullYear()}`,
        amount: Math.round((base[category] ?? 20000) * rng.float(0.9, 1.12, 3)),
        date: localDate(new Date(ref.getFullYear(), ref.getMonth(), rng.int(3, 25))),
        status: offset === 0 ? rng.weighted([['pago', 65], ['pendente', 35]]) : 'pago',
        supplier: rng.bool(0.55) ? rng.pick(SERVICE_COMPANIES) : undefined,
      });
    });
  }

  return { invoices, ledger };
}

/* ---------------- Chamados ---------------- */

function buildTickets({ rng, condoId, occupiedUnits, residents, demoUnit }: AssembleInput): Ticket[] {
  const tickets: Ticket[] = [];
  const assignees = ['Equipe de Manutenção', 'Zeladoria', 'Elevalux Elevadores', 'HidroPrime Serviços', 'Administração'];
  const locations = ['Corredor Torre A', 'Corredor Torre B', 'Corredor Torre C', 'Corredor Torre D', 'Hall Social', 'Garagem S1', 'Garagem S2', 'Área de Lazer', 'Academia', 'Piscina', 'Portaria', 'Salão de Festas'];

  const make = (i: number, status: Ticket['status'], dayOffset: number, unit?: Unit, override?: Partial<Ticket>): Ticket => {
    const category = rng.pick(TICKET_CATEGORIES);
    const title = rng.pick(TICKET_TITLES[category] ?? ['Solicitação de manutenção']);
    const createdAt = pastTime(dayOffset, rng.int(7, 21), rng.int(0, 59));
    const resident = unit ? residents.find((r) => r.unitId === unit.id) : undefined;
    const updates: Ticket['updates'] = [
      { id: `tu-${i}-1`, at: createdAt, author: resident?.name ?? 'Morador', message: 'Chamado aberto.' },
    ];
    if (status !== 'aberto') {
      updates.push({ id: `tu-${i}-2`, at: pastTime(dayOffset, rng.int(8, 22), rng.int(0, 59)), author: 'Zeladoria', message: 'Chamado recebido e encaminhado à equipe responsável.', status: 'em_andamento' });
    }
    if (status === 'resolvido') {
      updates.push({ id: `tu-${i}-3`, at: pastTime(dayOffset + rng.int(1, 3), rng.int(8, 18), rng.int(0, 59)), author: rng.pick(assignees), message: 'Serviço executado e conferido no local.', status: 'resolvido' });
    }
    return {
      id: `tkt-${i}`,
      condominiumId: condoId,
      unitId: unit?.id,
      code: `CH-${String(2400 + i).padStart(5, '0')}`,
      category,
      location: rng.pick(locations),
      title,
      description: `${title}. Registrado pelo aplicativo my Home com foto anexada para conferência da equipe.`,
      status,
      priority: rng.weighted([['normal', 54], ['baixa', 18], ['alta', 22], ['urgente', 6]]),
      openedBy: resident?.name ?? 'Administração',
      openedById: resident?.id,
      assignedTo: status === 'aberto' ? undefined : rng.pick(assignees),
      createdAt,
      updatedAt: updates[updates.length - 1].at,
      closedAt: status === 'resolvido' ? updates[updates.length - 1].at : undefined,
      hasAttachment: rng.bool(0.62),
      updates,
      ...override,
    };
  };

  let i = 0;
  for (; i < 23; i += 1) {
    tickets.push(make(i + 1, rng.weighted([['aberto', 52], ['em_andamento', 48]]), -rng.int(0, 9), rng.pick(occupiedUnits)));
  }
  for (let k = 0; k < 118; k += 1) {
    i += 1;
    tickets.push(make(i, rng.weighted([['resolvido', 94], ['cancelado', 6]]), -rng.int(10, 120), rng.pick(occupiedUnits)));
  }

  // Chamado histórico da unidade de demonstração
  tickets.push(make(999, 'resolvido', -14, demoUnit, {
    id: 'tkt-demo-1',
    code: 'CH-02388',
    category: 'Hidráulica',
    title: 'Infiltração no teto da área de serviço',
    location: 'Torre A — Apto 1204',
    openedBy: 'Carlos Almeida',
    openedById: 'res-demo-carlos',
    priority: 'alta',
  }));

  return tickets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* ---------------- Ocorrências ---------------- */

function buildIncidents({ rng, condoId, occupiedUnits, residents }: AssembleInput): Incident[] {
  const incidents: Incident[] = [];
  const types: Incident['type'][] = ['barulho', 'danos', 'acidente', 'seguranca', 'estrutural', 'regras', 'outros'];
  const locations = ['Torre A — 12º andar', 'Torre B — Hall', 'Garagem S1', 'Área de Lazer', 'Piscina', 'Portaria Principal', 'Salão de Festas', 'Playground', 'Torre D — 20º andar'];

  const make = (i: number, status: Incident['status'], dayOffset: number): Incident => {
    const type = rng.pick(types);
    const title = rng.pick(INCIDENT_TITLES[type]);
    const unit = rng.pick(occupiedUnits);
    const reporter = residents.find((r) => r.unitId === unit.id);
    const createdAt = pastTime(dayOffset, rng.int(6, 23), rng.int(0, 59));
    const actions: Incident['actions'] = [
      { id: `ia-${i}-1`, at: createdAt, author: reporter?.name ?? 'Portaria', message: 'Ocorrência registrada.' },
    ];
    if (status !== 'registrada') {
      actions.push({ id: `ia-${i}-2`, at: pastTime(dayOffset, rng.int(8, 23), rng.int(0, 59)), author: 'Helena Duarte', message: 'Ocorrência analisada pela síndica. Providências em andamento.' });
    }
    if (status === 'notificada' || status === 'encerrada') {
      actions.push({ id: `ia-${i}-3`, at: pastTime(dayOffset + 1, rng.int(9, 18), rng.int(0, 59)), author: 'Administração', message: 'Notificação formal enviada à unidade envolvida.' });
    }
    if (status === 'encerrada') {
      actions.push({ id: `ia-${i}-4`, at: pastTime(dayOffset + rng.int(2, 6), rng.int(9, 18), rng.int(0, 59)), author: 'Administração', message: 'Ocorrência encerrada sem reincidência.' });
    }
    return {
      id: `inc-${i}`,
      condominiumId: condoId,
      unitId: unit.id,
      code: `OC-${String(1200 + i).padStart(5, '0')}`,
      type,
      title,
      description: `${title}. Registro efetuado com evidências anexadas e testemunhas identificadas.`,
      severity: rng.weighted([['baixa', 30], ['media', 44], ['alta', 20], ['critica', 6]]),
      status,
      location: rng.pick(locations),
      reportedBy: reporter?.name ?? 'Portaria',
      involved: rng.bool(0.55) ? [`Unidade ${unit.block}-${unit.label}`] : [],
      createdAt,
      actions,
      attachments: rng.bool(0.7)
        ? rng.sample([
            { id: `at-${i}-1`, kind: 'foto' as const, label: 'evidencia-01.jpg' },
            { id: `at-${i}-2`, kind: 'video' as const, label: 'camera-corredor.mp4' },
            { id: `at-${i}-3`, kind: 'audio' as const, label: 'gravacao-ruido.m4a' },
          ], rng.int(1, 2))
        : [],
    };
  };

  for (let i = 1; i <= 7; i += 1) {
    incidents.push(make(i, rng.weighted([['registrada', 55], ['em_analise', 30], ['notificada', 15]]), -rng.int(0, 6)));
  }
  for (let i = 8; i <= 48; i += 1) {
    incidents.push(make(i, 'encerrada', -rng.int(7, 150)));
  }

  return incidents.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* ---------------- Manutenção ---------------- */

function buildMaintenance({ today, rng, condoId }: AssembleInput): MaintenanceOrder[] {
  const assets = [
    ['Elevadores — Torres A/B', 'Manutenção preventiva mensal', 'Elevalux Elevadores', 'mensal'],
    ['Elevadores — Torres C/D', 'Manutenção preventiva mensal', 'Elevalux Elevadores', 'mensal'],
    ['Bombas de recalque', 'Inspeção e troca de selo mecânico', 'HidroPrime Serviços', 'trimestral'],
    ['Gerador de emergência', 'Teste de carga e troca de óleo', 'FixPredial Manutenção', 'trimestral'],
    ['Sistema de combate a incêndio', 'Recarga de extintores e teste de hidrantes', 'SegurPro Sistemas', 'anual'],
    ['Piscina — casa de máquinas', 'Limpeza de filtro e análise química', 'AquaClean Piscinas', 'mensal'],
    ['Jardins e áreas verdes', 'Poda, adubação e irrigação', 'Verde Vivo Paisagismo', 'mensal'],
    ['Portões automáticos', 'Lubrificação e ajuste de sensores', 'FixPredial Manutenção', 'trimestral'],
    ['CFTV — 12 câmeras', 'Limpeza de lentes e verificação de gravação', 'SegurPro Sistemas', 'semestral'],
    ['Caixas d’água', 'Limpeza e laudo de potabilidade', 'HidroPrime Serviços', 'semestral'],
    ['Ar-condicionado — áreas comuns', 'Higienização e troca de filtros', 'Clima Ideal Refrigeração', 'trimestral'],
    ['Dedetização geral', 'Controle de pragas nas áreas comuns', 'Alpha Dedetizadora', 'semestral'],
    ['Fachada Torre A', 'Inspeção de revestimento', 'FixPredial Manutenção', 'anual'],
    ['Academia', 'Revisão dos equipamentos', 'FixPredial Manutenção', 'semestral'],
    ['Para-raios', 'Medição de aterramento', 'SegurPro Sistemas', 'anual'],
    ['Portaria — sistema de acesso', 'Atualização de firmware das controladoras', 'SegurPro Sistemas', 'trimestral'],
    ['Garagem — sinalização', 'Repintura de faixas e numeração', 'FixPredial Manutenção', 'anual'],
    ['Playground', 'Inspeção estrutural dos brinquedos', 'FixPredial Manutenção', 'trimestral'],
  ] as const;

  return assets.map((a, i) => {
    const dayOffset = rng.int(-40, 45);
    const status: MaintenanceOrder['status'] = dayOffset < -3
      ? rng.weighted([['concluida', 88], ['atrasada', 12]])
      : dayOffset <= 1 ? 'em_execucao' : 'agendada';
    return {
      id: `mnt-${i + 1}`,
      condominiumId: condoId,
      asset: a[0],
      description: a[1],
      supplier: a[2],
      scheduledFor: localDate(shiftDays(today, dayOffset)),
      status,
      cost: rng.int(680, 18400),
      recurrence: a[3] as MaintenanceOrder['recurrence'],
      lastExecutedAt: localDate(shiftDays(today, dayOffset - rng.int(28, 180))),
    };
  });
}

/* ---------------- Comunicados ---------------- */

function buildAnnouncements({ rng, condoId }: AssembleInput): Announcement[] {
  const items: Array<[string, string, Announcement['priority'], Announcement['audience'], number]> = [
    ['Manutenção programada dos elevadores', 'Nos dias 22 e 23 os elevadores sociais das Torres A e B passarão por manutenção preventiva entre 09h e 15h. Os elevadores de serviço permanecerão em operação.', 'importante', { kind: 'torre', ids: ['tower-A', 'tower-B'], label: 'Torres A e B' }, -1],
    ['Assembleia Geral Ordinária', 'Convocação para a Assembleia Geral Ordinária. Pauta: reforma da academia, aprovação das contas e eleição do conselho fiscal. Presença de todos os condôminos é essencial para o quórum.', 'urgente', { kind: 'todos', label: 'Todos os moradores' }, -2],
    ['Nova rotina de coleta seletiva', 'A partir de segunda-feira a coleta seletiva passa a ocorrer às terças e quintas. Utilize os contêineres identificados no subsolo 1.', 'normal', { kind: 'todos', label: 'Todos os moradores' }, -4],
    ['Interdição parcial da garagem S2', 'A área próxima às vagas 40 a 68 ficará interditada para reparo de infiltração entre os dias 18 e 20.', 'importante', { kind: 'todos', label: 'Todos os moradores' }, -5],
    ['Horário de funcionamento da academia', 'A academia funciona das 05h às 23h. Reserve seu horário pelo aplicativo my Home para garantir a capacidade máxima de 24 pessoas.', 'normal', { kind: 'todos', label: 'Todos os moradores' }, -8],
    ['Atualização do regimento interno', 'O regimento interno foi atualizado com as deliberações da última assembleia. O documento está disponível na biblioteca do aplicativo.', 'importante', { kind: 'todos', label: 'Todos os moradores' }, -12],
    ['Dedetização das áreas comuns', 'A dedetização será realizada no sábado, das 08h às 12h. Mantenha portas e janelas das áreas comuns fechadas.', 'normal', { kind: 'todos', label: 'Todos os moradores' }, -16],
    ['Instalação de carregadores para veículos elétricos', 'Foram instalados 8 pontos de recarga no subsolo 1. O cadastro é feito pelo aplicativo, na seção Veículos.', 'normal', { kind: 'todos', label: 'Todos os moradores' }, -21],
    ['Reforço na segurança do perímetro norte', 'Novas câmeras com visão noturna foram instaladas no perímetro norte, ampliando a cobertura do CFTV.', 'normal', { kind: 'todos', label: 'Todos os moradores' }, -27],
    ['Uso do salão de festas em datas comemorativas', 'Reservas para datas comemorativas seguem regra de sorteio. Inscrições abertas até o dia 30 pelo aplicativo.', 'normal', { kind: 'todos', label: 'Todos os moradores' }, -33],
    ['Troca de fechaduras — Torre C', 'As fechaduras das portas de emergência da Torre C serão substituídas na próxima quarta.', 'normal', { kind: 'torre', ids: ['tower-C'], label: 'Torre C' }, -38],
    ['Prestação de contas — trimestre', 'O balancete do trimestre está disponível na biblioteca de documentos para consulta de todos os condôminos.', 'importante', { kind: 'todos', label: 'Todos os moradores' }, -44],
  ];

  return items.map(([title, body, priority, audience, dayOffset], i) => ({
    id: `ann-${i + 1}`,
    condominiumId: condoId,
    title,
    body,
    priority,
    audience,
    publishedAt: pastTime(dayOffset, rng.int(8, 18), rng.int(0, 59)),
    author: rng.bool(0.7) ? 'Helena Duarte · Síndica' : 'Meridian Administração',
    readBy: [],
    pinned: i < 2,
  }));
}

/* ---------------- Documentos ---------------- */

function buildDocuments({ rng, condoId }: AssembleInput): DocumentFile[] {
  const docs: Array<[string, DocumentFile['category'], DocumentFile['format']]> = [
    ['Convenção do Condomínio — consolidada', 'convencao', 'pdf'],
    ['Convenção — registro em cartório', 'convencao', 'pdf'],
    ['Regimento Interno 2026', 'regimento', 'pdf'],
    ['Regimento Interno — anexo de áreas comuns', 'regimento', 'pdf'],
    ['Ata da Assembleia Geral Ordinária 2025', 'atas', 'pdf'],
    ['Ata da Assembleia Extraordinária — Fachada', 'atas', 'pdf'],
    ['Ata da Assembleia Extraordinária — Portaria remota', 'atas', 'pdf'],
    ['Ata de eleição do conselho fiscal', 'atas', 'pdf'],
    ['Contrato — Elevalux Elevadores', 'contratos', 'pdf'],
    ['Contrato — SegurPro Sistemas', 'contratos', 'pdf'],
    ['Contrato — CleanMax Facilities', 'contratos', 'pdf'],
    ['Contrato — Verde Vivo Paisagismo', 'contratos', 'pdf'],
    ['Apólice de seguro predial 2026', 'contratos', 'pdf'],
    ['Balancete — janeiro', 'balancetes', 'xlsx'],
    ['Balancete — fevereiro', 'balancetes', 'xlsx'],
    ['Balancete — março', 'balancetes', 'xlsx'],
    ['Balancete — abril', 'balancetes', 'xlsx'],
    ['Balancete — maio', 'balancetes', 'xlsx'],
    ['Balancete — junho', 'balancetes', 'xlsx'],
    ['Balancete — julho', 'balancetes', 'xlsx'],
    ['Previsão orçamentária 2026', 'balancetes', 'xlsx'],
    ['Comunicado — coleta seletiva', 'comunicados', 'pdf'],
    ['Comunicado — manutenção dos elevadores', 'comunicados', 'pdf'],
    ['Manual do proprietário', 'administrativo', 'pdf'],
    ['Planta baixa — pavimento tipo', 'administrativo', 'pdf'],
    ['AVCB — Auto de Vistoria do Corpo de Bombeiros', 'administrativo', 'pdf'],
    ['Laudo de potabilidade da água', 'administrativo', 'pdf'],
    ['Relatório de inspeção predial', 'administrativo', 'pdf'],
  ];

  return docs.map(([name, category, format], i) => ({
    id: `doc-${i + 1}`,
    condominiumId: condoId,
    name,
    category,
    sizeKb: rng.int(180, 9400),
    format,
    uploadedAt: pastTime(-rng.int(3, 400), rng.int(8, 18), rng.int(0, 59)),
    uploadedBy: rng.bool(0.6) ? 'Meridian Administração' : 'Helena Duarte',
    restricted: category === 'contratos' && rng.bool(0.4),
    downloads: rng.int(4, 860),
  }));
}

/* ---------------- Assembleias ---------------- */

function buildAssemblies({ today, rng, condoId, occupiedUnits, residents }: AssembleInput): Assembly[] {
  const votingUnits = rng.sample(occupiedUnits, 372);

  const buildVotes = (options: string[], distribution: number[]) => {
    const votes: AssemblyAgendaItemVote[] = [];
    votingUnits.forEach((unit, i) => {
      const roll = rng.next() * 100;
      let acc = 0;
      let option = options[0];
      for (let k = 0; k < options.length; k += 1) {
        acc += distribution[k];
        if (roll <= acc) { option = options[k]; break; }
      }
      votes.push({
        unitId: unit.id,
        option,
        at: pastTime(-rng.int(1, 5), rng.int(8, 22), rng.int(0, 59)),
        voterName: residents.find((r) => r.unitId === unit.id)?.name ?? unit.ownerName,
      });
      void i;
    });
    return votes;
  };

  return [
    {
      id: 'asm-1',
      condominiumId: condoId,
      title: 'Assembleia Geral Ordinária 2026',
      kind: 'ordinaria',
      date: localDate(shiftDays(today, 4)),
      time: '19:30',
      location: 'Salão de Festas + transmissão online',
      status: 'em_votacao',
      quorumRequired: 25,
      agenda: [
        {
          id: 'ag-1-1', order: 1,
          title: 'Reforma da academia',
          description: 'Aprovação da reforma completa da academia com substituição de equipamentos, piso e climatização. Investimento estimado de R$ 268.000,00, com uso do fundo de obras e parcelamento em 6 vezes.',
          options: ['Aprovar', 'Rejeitar', 'Abster-se'],
          votes: buildVotes(['Aprovar', 'Rejeitar', 'Abster-se'], [68, 24, 8]),
        },
        {
          id: 'ag-1-2', order: 2,
          title: 'Aprovação das contas do exercício anterior',
          description: 'Análise e aprovação da prestação de contas do exercício encerrado, com parecer favorável do conselho fiscal.',
          options: ['Aprovar', 'Rejeitar', 'Abster-se'],
          votes: buildVotes(['Aprovar', 'Rejeitar', 'Abster-se'], [82, 9, 9]),
        },
        {
          id: 'ag-1-3', order: 3,
          title: 'Eleição do conselho fiscal',
          description: 'Eleição dos três membros titulares do conselho fiscal para o biênio 2026–2028.',
          options: ['Chapa Renovação', 'Chapa Continuidade', 'Abster-se'],
          votes: buildVotes(['Chapa Renovação', 'Chapa Continuidade', 'Abster-se'], [46, 42, 12]),
        },
      ],
    },
    {
      id: 'asm-2',
      condominiumId: condoId,
      title: 'Assembleia Extraordinária — Portaria remota',
      kind: 'extraordinaria',
      date: localDate(shiftDays(today, -96)),
      time: '20:00',
      location: 'Salão de Festas',
      status: 'encerrada',
      quorumRequired: 33,
      minutesDocumentId: 'doc-7',
      agenda: [
        {
          id: 'ag-2-1', order: 1,
          title: 'Implantação de portaria remota no portão de serviço',
          description: 'Contratação de portaria remota em turno noturno para o portão de serviço, com redução estimada de 18% no custo de segurança.',
          options: ['Aprovar', 'Rejeitar', 'Abster-se'],
          votes: buildVotes(['Aprovar', 'Rejeitar', 'Abster-se'], [58, 34, 8]),
        },
      ],
    },
    {
      id: 'asm-3',
      condominiumId: condoId,
      title: 'Assembleia Extraordinária — Fachada',
      kind: 'extraordinaria',
      date: localDate(shiftDays(today, 38)),
      time: '19:00',
      location: 'Salão de Festas + transmissão online',
      status: 'agendada',
      quorumRequired: 33,
      agenda: [
        {
          id: 'ag-3-1', order: 1,
          title: 'Recuperação da fachada das Torres C e D',
          description: 'Aprovação do escopo, cronograma e fonte de recursos para a recuperação das fachadas das Torres C e D.',
          options: ['Aprovar', 'Rejeitar', 'Abster-se'],
          votes: [],
        },
      ],
    },
  ];
}

type AssemblyAgendaItemVote = Assembly['agenda'][number]['votes'][number];

/* ---------------- Notificações ---------------- */

function buildNotifications(
  input: AssembleInput & { deliveries: Delivery[]; invoices: Invoice[]; reservations: Reservation[]; tickets: Ticket[] },
): AppNotification[] {
  const { condoId, demoUnit, deliveries, invoices } = input;
  const notifications: AppNotification[] = [];
  const nextInvoice = invoices.find((i) => i.unitId === demoUnit.id && i.status === 'aberto');

  const push = (n: Omit<AppNotification, 'id' | 'condominiumId'>) => {
    notifications.push({ id: `ntf-${notifications.length + 1}`, condominiumId: condoId, ...n });
  };

  push({
    userId: 'user-morador', unitId: demoUnit.id, kind: 'encomenda',
    title: 'Nova encomenda recebida',
    body: `Uma encomenda da ${deliveries[0]?.carrier ?? 'transportadora'} foi recebida na portaria e está na prateleira A2.`,
    at: pastTime(0, 9, 27), read: false, link: '/app/encomendas', refId: 'del-demo-1',
  });
  push({
    userId: 'user-morador', unitId: demoUnit.id, kind: 'veiculo',
    title: 'Veículo detectado na garagem',
    body: 'O veículo RFT4J81 (Toyota Corolla Cross) entrou pelo Portão Garagem.',
    at: pastTime(0, 9, 55), read: false, link: '/app/acessos',
  });
  push({
    userId: 'user-morador', unitId: demoUnit.id, kind: 'aviso',
    title: 'Assembleia Geral Ordinária',
    body: 'Convocação publicada. Sua participação é essencial para o quórum.',
    at: pastTime(-2, 10, 12), read: false, link: '/app/assembleias',
  });
  push({
    userId: 'user-morador', unitId: demoUnit.id, kind: 'boleto',
    title: 'Boleto disponível',
    body: `Seu boleto de ${nextInvoice?.reference ?? 'competência atual'} está disponível. Vencimento em ${nextInvoice ? nextInvoice.dueDate.split('-').reverse().join('/') : '10'}.`,
    at: pastTime(-3, 8, 0), read: true, link: '/app/financeiro',
  });
  push({
    userId: 'user-morador', unitId: demoUnit.id, kind: 'reserva',
    title: 'Reserva confirmada',
    body: 'Sua reserva do Salão de Festas foi confirmada pela administração.',
    at: pastTime(-6, 20, 22), read: true, link: '/app/reservas',
  });
  push({
    userId: 'user-morador', unitId: demoUnit.id, kind: 'autorizacao',
    title: 'Autorização prestes a vencer',
    body: 'A autorização recorrente de Anderson Luz (AquaClean Piscinas) vence em 7 dias.',
    at: pastTime(-1, 7, 30), read: true, link: '/app/visitantes',
  });

  push({
    role: 'portaria', kind: 'acesso',
    title: '127 visitantes esperados hoje',
    body: 'A lista de visitantes do dia foi atualizada. 12 chegadas previstas para a próxima hora.',
    at: pastTime(0, 7, 0), read: false, link: '/portaria',
  });
  push({
    role: 'portaria', kind: 'ocorrencia',
    title: 'Portão de pedestres em manutenção',
    body: 'O acesso de pedestres está em manutenção. Direcione o fluxo para o Portão Principal.',
    at: pastTime(0, 6, 15), read: false, link: '/portaria/portoes',
  });

  push({
    role: 'sindico', kind: 'chamado',
    title: '23 chamados abertos',
    body: '4 chamados estão marcados como urgentes e aguardam atribuição.',
    at: pastTime(0, 8, 5), read: false, link: '/gestao/chamados',
  });
  push({
    role: 'sindico', kind: 'ocorrencia',
    title: 'Nova ocorrência de segurança',
    body: 'Uma ocorrência classificada como alta severidade foi registrada na Garagem S1.',
    at: pastTime(-1, 22, 41), read: false, link: '/gestao/ocorrencias',
  });
  push({
    role: 'sindico', kind: 'assembleia',
    title: 'Votação em andamento',
    body: 'A Assembleia Geral Ordinária já registrou 372 votos. Quórum atingido para as três pautas.',
    at: pastTime(-1, 9, 0), read: true, link: '/gestao/assembleias',
  });

  return notifications.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/* ---------------- Auditoria ---------------- */

function buildAudit({ rng, condoId, residents, occupiedUnits }: AssembleInput): AuditEntry[] {
  const entries: AuditEntry[] = [];
  const actions: Array<[string, string, string]> = [
    ['Autorizou visitante', 'Visitantes', 'morador'],
    ['Registrou entrada', 'Controle de acesso', 'portaria'],
    ['Registrou saída', 'Controle de acesso', 'portaria'],
    ['Registrou encomenda', 'Encomendas', 'portaria'],
    ['Confirmou retirada de encomenda', 'Encomendas', 'portaria'],
    ['Abriu portão', 'Portões', 'portaria'],
    ['Aprovou reserva', 'Reservas', 'sindico'],
    ['Publicou comunicado', 'Comunicados', 'sindico'],
    ['Encerrou chamado', 'Chamados', 'sindico'],
    ['Cadastrou veículo', 'Veículos', 'morador'],
    ['Revogou autorização', 'Visitantes', 'morador'],
    ['Exportou relatório financeiro', 'Financeiro', 'administrador'],
    ['Alterou configuração de área comum', 'Configurações', 'administrador'],
    ['Registrou ocorrência', 'Ocorrências', 'portaria'],
    ['Fez upload de documento', 'Documentos', 'administrador'],
  ];

  const actorsByRole: Record<string, string[]> = {
    morador: rng.sample(residents, 40).map((r) => r.name),
    portaria: ['Marcos Vieira', 'Ana Paula Reis', 'Jorge Tavares', 'Sandra Lopes'],
    sindico: ['Helena Duarte'],
    administrador: ['Ricardo Monteiro', 'Beatriz Salgado'],
  };

  entries.push({
    id: 'aud-demo-1', condominiumId: condoId, at: pastTime(0, 10, 42),
    actorName: 'Carlos Almeida', actorRole: 'morador', action: 'Autorizou visitante',
    target: 'João da Silva', detail: 'Torre A · Apto 1204 · Autorização única', ip: '187.22.104.61', module: 'Visitantes',
  });
  entries.push({
    id: 'aud-demo-2', condominiumId: condoId, at: pastTime(0, 10, 44),
    actorName: 'Marcos Vieira', actorRole: 'portaria', action: 'Registrou entrada',
    target: 'João da Silva', detail: 'Portão Principal · Validação por QR Code', ip: '10.0.14.22', module: 'Controle de acesso',
  });

  for (let i = 0; i < 160; i += 1) {
    const [action, module, role] = rng.pick(actions);
    const unit = rng.pick(occupiedUnits);
    entries.push({
      id: `aud-${i + 1}`,
      condominiumId: condoId,
      at: pastTime(-rng.int(0, 14), rng.int(6, 23), rng.int(0, 59)),
      actorName: rng.pick(actorsByRole[role]),
      actorRole: role as AuditEntry['actorRole'],
      action,
      target: rng.bool(0.5) ? fullName(rng) : `Unidade ${unit.block}-${unit.label}`,
      detail: `Torre ${unit.block} · Apto ${unit.label}`,
      ip: `${rng.int(10, 201)}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`,
      module,
    });
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : -1));
}


/* ---------------- Profissionais recomendados ---------------- */

const PROFESSIONAL_MIX: [ProfessionalCategory, number][] = [
  ['eletrica', 5], ['hidraulica', 5], ['reformas', 4], ['limpeza', 5],
  ['climatizacao', 4], ['montagem', 3], ['chaveiro', 3], ['pintura', 3],
  ['tecnologia', 3], ['jardinagem', 2], ['pet', 3], ['aulas', 3],
  ['mudancas', 2], ['dedetizacao', 2],
];

const RESPONSE_TIMES = ['Responde em minutos', 'Responde em até 1 h', 'Responde em até 2 h', 'Responde no mesmo dia'];

function buildProfessionals({ condoId, occupiedUnits, residents }: AssembleInput): {
  professionals: Professional[];
  professionalReviews: ProfessionalReview[];
  serviceRequests: ServiceRequest[];
} {
  // Semente própria: o volume de acessos gerado antes daqui varia com a hora
  // do dia, o que deslocaria o fluxo compartilhado e faria o catálogo mudar a
  // cada carregamento. Com um `Rng` isolado a lista é sempre a mesma.
  const rng = new Rng(`${SEED_KEY}-profissionais`);

  const professionals: Professional[] = [];
  const professionalReviews: ProfessionalReview[] = [];
  const serviceRequests: ServiceRequest[] = [];

  let seq = 0;
  let reviewSeq = 0;

  for (const [category, count] of PROFESSIONAL_MIX) {
    const catalog = PROFESSIONAL_CATALOG[category];

    for (let i = 0; i < count; i += 1) {
      seq += 1;
      const name = fullName(rng);
      const soloTrader = rng.bool(0.45);
      const company = soloTrader ? undefined : `${name.split(' ')[0]} ${rng.pick(catalog.suffixes)}`;

      // A nota média sai de uma faixa alta: são profissionais que já
      // passaram pelo crivo do condomínio, não um cadastro aberto.
      const rating = rng.float(3.9, 5, 1);
      const reviewsCount = rng.int(4, 38);
      const recommended = rng.bool(0.42);

      const professional: Professional = {
        id: `prof-${seq}`,
        condominiumId: condoId,
        name,
        document: soloTrader ? cpf(rng) : `${rng.int(10, 99)}.${rng.int(100, 999)}.${rng.int(100, 999)}/0001-${rng.int(10, 99)}`,
        company,
        category,
        specialties: rng.sample(catalog.specialties, rng.int(2, 4)),
        phone: phone(rng),
        email: rng.bool(0.6) ? email(name, seq) : undefined,
        bio: `${rng.pick(catalog.roles)} com ${rng.int(4, 22)} anos de experiência. ${
          recommended
            ? 'Indicado pela administração após atendimentos recorrentes no condomínio.'
            : 'Cadastrado a partir da indicação de moradores.'
        }`,
        serviceArea: rng.pick(['Zona Sul e região', 'Toda a capital', 'Bairro e adjacências', 'Capital e Grande São Paulo']),
        since: `20${rng.int(19, 25)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`,
        jobsInCondo: rng.int(3, 96),
        rating,
        reviewsCount,
        priceFrom: rng.bool(0.75) ? rng.int(80, 460) : undefined,
        responseTime: rng.pick(RESPONSE_TIMES),
        verified: rng.bool(0.72),
        recommendedByCondo: recommended,
        recommendedBy: recommended ? rng.pick(['Helena Duarte · Síndica', 'Meridian Administração', 'Conselho fiscal']) : undefined,
        emergency: category === 'chaveiro' || category === 'hidraulica' ? rng.bool(0.6) : rng.bool(0.15),
        active: rng.bool(0.96),
        createdAt: pastTime(-rng.int(30, 900), rng.int(9, 19), rng.int(0, 59)),
      };
      professionals.push(professional);

      // Avaliações escritas por moradores reais do condomínio.
      const written = Math.min(reviewsCount, rng.int(2, 6));
      const reviewers = rng.sample(occupiedUnits, written);
      reviewers.forEach((unit, k) => {
        reviewSeq += 1;
        const author = residents.find((r) => r.unitId === unit.id);
        const good = rng.bool(0.82);
        professionalReviews.push({
          id: `prev-${reviewSeq}`,
          professionalId: professional.id,
          condominiumId: condoId,
          unitId: unit.id,
          authorName: author?.name ?? unit.ownerName,
          rating: good ? rng.int(5, 5) : rng.int(3, 4),
          service: rng.pick(professional.specialties),
          comment: good ? rng.pick(REVIEW_COMMENTS_GOOD) : rng.pick(REVIEW_COMMENTS_MIXED),
          at: pastTime(-rng.int(2, 300) - k, rng.int(8, 21), rng.int(0, 59)),
        });
      });
    }
  }

  // Pedidos de orçamento já feitos por moradores — dá lastro ao histórico.
  const requesters = rng.sample(occupiedUnits, 46);
  requesters.forEach((unit, i) => {
    const professional = rng.pick(professionals);
    const resident = residents.find((r) => r.unitId === unit.id);
    const status = rng.weighted<ServiceRequest['status']>([
      ['concluido', 46], ['contratado', 18], ['respondido', 20], ['enviado', 10], ['cancelado', 6],
    ]);
    serviceRequests.push({
      id: `sreq-${i + 1}`,
      condominiumId: condoId,
      professionalId: professional.id,
      unitId: unit.id,
      residentName: resident?.name ?? unit.ownerName,
      service: rng.pick(SERVICE_REQUEST_SUBJECTS),
      description: 'Solicitação enviada pelo aplicativo my Home.',
      status,
      createdAt: pastTime(-rng.int(1, 120), rng.int(8, 21), rng.int(0, 59)),
      quotedAmount: status === 'enviado' ? undefined : rng.int(120, 1800),
      respondedAt: status === 'enviado' ? undefined : pastTime(-rng.int(0, 60), rng.int(8, 21), rng.int(0, 59)),
    });
  });

  return { professionals, professionalReviews, serviceRequests };
}
