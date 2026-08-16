/* =========================================================
   NEXOR AI — Concierge
   ---------------------------------------------------------
   ARQUITETURA
   O concierge é definido por uma interface de provedor. No MVP
   existe um provedor local que interpreta a intenção da pergunta
   e responde consultando os mesmos services do restante da
   aplicação — ou seja, as respostas são reais em relação aos
   dados, apenas o modelo de linguagem é simulado.

   Na Fase 5 basta registrar um provedor que chame o modelo real,
   passando o mesmo `ConciergeContext` como contexto estruturado.
   Nenhuma tela precisa mudar.
   ========================================================= */

import type { ID, User } from '../data/types';
import { formatDate, isoDate } from '../lib/date';
import { currency, number, percent } from '../lib/format';
import { accessesToday } from './access';
import { commonAreas, reservationsOfUnit, reservationsOn } from './reservations';
import { deliveriesOfUnit } from './deliveries';
import { invoicesOfUnit, nextInvoice, financialSummary, overdueInvoices } from './finance';
import { openTickets, ticketsOfUnit } from './tickets';
import { openIncidents, incidents } from './incidents';
import { activeAuthorizations } from './visitors';
import { vehiclesOfUnit } from './vehicles';
import { announcements } from './communication';
import { staffOfUnit, unitLabel, units } from './directory';
import { dashboardSnapshot } from './analytics';

export interface ConciergeContext {
  user: User;
  condominiumId: ID;
  unitId?: ID;
  now: Date;
}

export interface ConciergeAnswer {
  text: string;
  bullets?: string[];
  suggestions?: string[];
  link?: { label: string; to: string };
}

export interface ConciergeProvider {
  id: string;
  ask(question: string, context: ConciergeContext): Promise<ConciergeAnswer>;
}

/* ---------------- Interpretação de intenção ---------------- */

type Intent =
  | 'encomendas' | 'boleto' | 'reserva' | 'horarios' | 'visitantes' | 'veiculos'
  | 'chamados' | 'inadimplencia' | 'ocorrencias' | 'resumo' | 'acessos'
  | 'comunicados' | 'funcionarios' | 'documentos' | 'desconhecido';

const INTENT_RULES: { intent: Intent; patterns: RegExp[] }[] = [
  { intent: 'encomendas', patterns: [/encomend/i, /pacote/i, /entrega/i, /correio/i] },
  { intent: 'boleto', patterns: [/boleto/i, /vence/i, /vencimento/i, /pagar/i, /taxa condominial/i, /financeiro/i, /segunda via/i] },
  { intent: 'reserva', patterns: [/reserv/i, /sal[ãa]o/i, /churrasqueira/i, /quadra/i, /coworking/i, /espa[çc]o/i] },
  { intent: 'horarios', patterns: [/hor[áa]rio/i, /que horas/i, /funciona/i, /abre/i, /fecha/i, /academia/i, /piscina/i] },
  { intent: 'visitantes', patterns: [/visitante/i, /autoriza/i, /convidad/i, /quem est[áa] autorizado/i, /entrar na minha/i] },
  { intent: 'veiculos', patterns: [/ve[íi]culo/i, /carro/i, /placa/i, /vaga/i, /garagem/i] },
  { intent: 'chamados', patterns: [/chamad/i, /manuten[çc]/i, /ticket/i, /solicita[çc]/i, /conserto/i] },
  { intent: 'inadimplencia', patterns: [/inadimpl/i, /devedor/i, /atras/i] },
  { intent: 'ocorrencias', patterns: [/ocorr[êe]nci/i, /problema/i, /barulho/i, /reclama/i] },
  { intent: 'resumo', patterns: [/resumo/i, /vis[ãa]o geral/i, /como est[áa] o condom[íi]nio/i, /panorama/i, /status/i] },
  { intent: 'acessos', patterns: [/acess/i, /entrada/i, /sa[íi]da/i, /portaria/i, /movimento/i] },
  { intent: 'comunicados', patterns: [/comunicad/i, /aviso/i, /not[íi]cia/i, /assembleia/i] },
  { intent: 'funcionarios', patterns: [/funcion[áa]ri/i, /empregad/i, /diarista/i, /prestador/i] },
  { intent: 'documentos', patterns: [/documento/i, /conven[çc][ãa]o/i, /regimento/i, /ata/i, /balancete/i] },
];

function detectIntent(question: string): Intent {
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(question))) return rule.intent;
  }
  return 'desconhecido';
}

/* ---------------- Provedor local (MVP) ---------------- */

function residentAnswer(intent: Intent, ctx: ConciergeContext, question: string): ConciergeAnswer {
  const { condominiumId, unitId, now } = ctx;
  const today = isoDate(now);

  switch (intent) {
    case 'encomendas': {
      const pending = unitId ? deliveriesOfUnit(unitId).filter((d) => d.status !== 'retirada' && d.status !== 'devolvida') : [];
      if (!pending.length) {
        return { text: 'Você não tem encomendas aguardando retirada na portaria no momento.', link: { label: 'Ver histórico de encomendas', to: '/app/encomendas' } };
      }
      return {
        text: `Você tem ${pending.length === 1 ? '1 encomenda aguardando' : `${pending.length} encomendas aguardando`} retirada na portaria.`,
        bullets: pending.map((d) => `${d.carrier} · código ${d.trackingCode} · prateleira ${d.shelf}`),
        link: { label: 'Abrir encomendas', to: '/app/encomendas' },
      };
    }

    case 'boleto': {
      const invoice = unitId ? nextInvoice(unitId) : undefined;
      if (!invoice) return { text: 'Não há boletos em aberto para a sua unidade. Todos os pagamentos estão em dia.', link: { label: 'Ver financeiro', to: '/app/financeiro' } };
      const history = unitId ? invoicesOfUnit(unitId).filter((i) => i.status === 'pago').slice(0, 3) : [];
      return {
        text: `Seu próximo boleto é de ${currency(invoice.amount)}, referência ${invoice.reference}, com vencimento em ${formatDate(invoice.dueDate)}.`,
        bullets: history.length ? [`Últimos pagamentos: ${history.map((h) => h.reference).join(', ')} — todos quitados.`] : undefined,
        link: { label: 'Abrir meu financeiro', to: '/app/financeiro' },
      };
    }

    case 'reserva': {
      const areas = commonAreas(condominiumId);
      const mine = unitId ? reservationsOfUnit(unitId).filter((r) => r.date >= today && r.status !== 'cancelada') : [];
      const mentioned = areas.find((a) => question.toLowerCase().includes(a.name.toLowerCase().split(' ')[0]));
      if (mentioned) {
        const taken = reservationsOn(condominiumId, today).filter((r) => r.areaId === mentioned.id);
        return {
          text: `${mentioned.name}: capacidade de ${mentioned.capacity} pessoas, taxa de ${mentioned.fee ? currency(mentioned.fee) : 'isenta'}${mentioned.autoApprove ? ' e aprovação automática' : ' e aprovação pela administração'}.`,
          bullets: [
            `Horários disponíveis: ${mentioned.slots.join(' · ')}`,
            `Reservas para hoje: ${taken.length}`,
            ...mentioned.rules.slice(0, 2),
          ],
          link: { label: 'Fazer reserva', to: '/app/reservas' },
        };
      }
      return {
        text: mine.length
          ? `Você tem ${mine.length} reserva(s) futura(s).`
          : 'Você não possui reservas futuras. São 10 áreas comuns disponíveis para reserva.',
        bullets: mine.length
          ? mine.map((r) => `${areas.find((a) => a.id === r.areaId)?.name} · ${formatDate(r.date)} · ${r.slot}`)
          : areas.slice(0, 5).map((a) => `${a.name} — ${a.fee ? currency(a.fee) : 'sem taxa'}`),
        link: { label: 'Abrir reservas', to: '/app/reservas' },
      };
    }

    case 'horarios': {
      const areas = commonAreas(condominiumId);
      const mentioned = areas.find((a) => question.toLowerCase().includes(a.name.toLowerCase().split(' ')[0]))
        ?? areas.find((a) => a.kind === 'academia');
      if (!mentioned) return { text: 'Consulte os horários das áreas comuns na seção de reservas.', link: { label: 'Ver áreas comuns', to: '/app/reservas' } };
      return {
        text: `${mentioned.name} funciona nos horários abaixo, com capacidade de ${mentioned.capacity} pessoas.`,
        bullets: [...mentioned.slots, ...mentioned.rules.slice(0, 2)],
        link: { label: 'Reservar horário', to: '/app/reservas' },
      };
    }

    case 'visitantes': {
      const active = unitId ? activeAuthorizations(unitId) : [];
      if (!active.length) return { text: 'Não há autorizações ativas para a sua unidade no momento.', link: { label: 'Autorizar visitante', to: '/app/visitantes' } };
      return {
        text: `Há ${active.length} autorização(ões) ativa(s) para ${unitLabel(unitId)}.`,
        bullets: active.map((v) => `${v.name} · ${v.kind} · previsto para ${formatDate(v.expectedDate)} às ${v.expectedTime}`),
        link: { label: 'Gerenciar visitantes', to: '/app/visitantes' },
      };
    }

    case 'veiculos': {
      const list = unitId ? vehiclesOfUnit(unitId) : [];
      return {
        text: list.length
          ? `Sua unidade tem ${list.length} veículo(s) cadastrado(s).`
          : 'Nenhum veículo cadastrado para a sua unidade.',
        bullets: list.map((v) => `${v.plate} · ${v.brand} ${v.model} · vaga ${v.parkingSpot ?? '—'}`),
        link: { label: 'Gerenciar veículos', to: '/app/veiculos' },
      };
    }

    case 'chamados': {
      const list = unitId ? ticketsOfUnit(unitId) : [];
      const open = list.filter((t) => t.status === 'aberto' || t.status === 'em_andamento');
      return {
        text: open.length
          ? `Você tem ${open.length} chamado(s) em andamento.`
          : 'Você não tem chamados em aberto. Posso ajudar a abrir um novo.',
        bullets: open.map((t) => `${t.code} · ${t.title} · ${t.status === 'aberto' ? 'aguardando atendimento' : 'em andamento'}`),
        link: { label: 'Abrir chamado', to: '/app/chamados' },
      };
    }

    case 'funcionarios': {
      const list = unitId ? staffOfUnit(unitId) : [];
      return {
        text: list.length
          ? `Sua unidade tem ${list.length} pessoa(s) autorizada(s) com acesso recorrente.`
          : 'Nenhum funcionário cadastrado para a sua unidade.',
        bullets: list.map((s) => `${s.name} · ${s.role} · ${s.shiftStart}–${s.shiftEnd}`),
        link: { label: 'Gerenciar funcionários', to: '/app/funcionarios' },
      };
    }

    case 'comunicados': {
      const list = announcements(condominiumId).slice(0, 3);
      return {
        text: 'Estes são os comunicados mais recentes do condomínio:',
        bullets: list.map((a) => `${a.title} — ${formatDate(a.publishedAt.slice(0, 10))}`),
        link: { label: 'Ver comunicados', to: '/app/comunicados' },
      };
    }

    case 'documentos':
      return {
        text: 'A biblioteca de documentos reúne convenção, regimento interno, atas, contratos e balancetes.',
        link: { label: 'Abrir documentos', to: '/app/documentos' },
      };

    case 'acessos': {
      const total = accessesToday(condominiumId, today).length;
      return {
        text: `O condomínio registrou ${number(total)} acessos hoje. Você pode consultar o histórico completo da sua unidade.`,
        link: { label: 'Ver acessos', to: '/app/acessos' },
      };
    }

    default:
      return {
        text: 'Posso ajudar com encomendas, boletos, reservas, visitantes, veículos, chamados e informações do condomínio. Sobre o que você quer saber?',
        suggestions: [
          'Tenho alguma encomenda?',
          'Quando vence meu boleto?',
          'Posso reservar o salão sábado?',
          'Quem está autorizado a entrar na minha unidade?',
        ],
      };
  }
}

function managerAnswer(intent: Intent, ctx: ConciergeContext): ConciergeAnswer {
  const { condominiumId, now } = ctx;
  const today = isoDate(now);
  const snapshot = dashboardSnapshot(condominiumId, now);

  switch (intent) {
    case 'chamados': {
      const open = openTickets(condominiumId);
      const urgent = open.filter((t) => t.priority === 'urgente' || t.priority === 'alta');
      return {
        text: `Há ${open.length} chamados abertos, sendo ${urgent.length} de prioridade alta ou urgente.`,
        bullets: urgent.slice(0, 4).map((t) => `${t.code} · ${t.title} · ${t.location}`),
        link: { label: 'Abrir gestão de chamados', to: '/gestao/chamados' },
      };
    }

    case 'inadimplencia':
    case 'boleto': {
      const summary = financialSummary(condominiumId, units(condominiumId), today.slice(0, 7));
      const overdue = overdueInvoices(condominiumId);
      return {
        text: `A inadimplência atual é de ${percent(summary.delinquencyRate)}, o equivalente a ${currency(summary.delinquentAmount)} distribuídos em ${summary.delinquentUnits} unidades.`,
        bullets: [
          `Receitas do mês: ${currency(summary.revenue)}`,
          `Despesas do mês: ${currency(summary.expenses)}`,
          `Saldo: ${currency(summary.balance)}`,
          `Boletos vencidos em aberto: ${overdue.length}`,
        ],
        link: { label: 'Abrir financeiro', to: '/gestao/financeiro' },
      };
    }

    case 'ocorrencias': {
      const open = openIncidents(condominiumId);
      const byType = new Map<string, number>();
      incidents(condominiumId).slice(0, 60).forEach((i) => byType.set(i.type, (byType.get(i.type) ?? 0) + 1));
      const ranked = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      return {
        text: `Existem ${open.length} ocorrências em aberto. Os problemas mais registrados recentemente são:`,
        bullets: ranked.map(([type, count]) => `${type} — ${count} registros`),
        link: { label: 'Abrir ocorrências', to: '/gestao/ocorrencias' },
      };
    }

    case 'acessos':
      return {
        text: `Foram registrados ${number(snapshot.accessesToday)} acessos hoje, com ${snapshot.expectedVisitors} visitantes esperados e ${snapshot.onSiteVisitors} atualmente no condomínio.`,
        link: { label: 'Ver controle de acesso', to: '/gestao/acessos' },
      };

    case 'resumo':
    default:
      return {
        text: 'Resumo operacional do Residencial Parque Central:',
        bullets: [
          `${number(snapshot.residents)} moradores em ${number(snapshot.units)} unidades (${percent(snapshot.occupancyRate)} de ocupação)`,
          `${number(snapshot.accessesToday)} acessos hoje · ${snapshot.expectedVisitors} visitantes esperados`,
          `${snapshot.openTickets} chamados abertos · ${snapshot.openIncidents} ocorrências em aberto`,
          `${snapshot.pendingDeliveries} encomendas aguardando retirada · ${snapshot.reservationsToday} reservas hoje`,
          `Inadimplência em ${percent(snapshot.delinquencyRate)}`,
        ],
        link: { label: 'Abrir dashboard', to: '/gestao' },
      };
  }
}

export const localConciergeProvider: ConciergeProvider = {
  id: 'nexor-local-mvp',
  async ask(question, context) {
    // Latência simulada para preservar a percepção de processamento.
    await new Promise((resolve) => setTimeout(resolve, 520 + Math.random() * 420));
    const intent = detectIntent(question);
    const isManager = context.user.role !== 'morador' && context.user.role !== 'portaria';
    return isManager ? managerAnswer(intent, context) : residentAnswer(intent, context, question);
  },
};

let provider: ConciergeProvider = localConciergeProvider;

/** Ponto de extensão da Fase 5: registrar o provedor de IA real. */
export function setConciergeProvider(next: ConciergeProvider): void {
  provider = next;
}

export function ask(question: string, context: ConciergeContext): Promise<ConciergeAnswer> {
  return provider.ask(question, context);
}

export const RESIDENT_SUGGESTIONS = [
  'Tenho alguma encomenda?',
  'Quando vence meu boleto?',
  'Qual o horário da academia?',
  'Posso reservar o salão sábado?',
  'Quem está autorizado a entrar na minha unidade?',
  'Quais são os últimos comunicados?',
];

export const MANAGER_SUGGESTIONS = [
  'Faça um resumo do condomínio.',
  'Quantos chamados estão abertos?',
  'Como está a inadimplência?',
  'Quais são os principais problemas registrados?',
  'Como está o movimento de acessos hoje?',
];
