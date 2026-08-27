import type {
  Affiliate,
  Automation,
  BlacklistEntry,
  Campaign,
  CashFlowPoint,
  Appointment,
  Commission,
  CommissionRule,
  LeadPrediction,
  Notification,
  Payable,
  PaymentRecord,
  Team,
  Contract,
  Conversation,
  Customer,
  CsatResponse,
  Insight,
  Integration,
  Invoice,
  Lead,
  Message,
  Organization,
  Pipeline,
  Plan,
  Product,
  Proposal,
  Quote,
  Task,
  Ticket,
  TimelineEvent,
  UsageSnapshot,
  User,
  AuditLog,
  KnowledgeArticle,
} from '@veyra/core';

/**
 * Base de demonstração
 *
 * Uma operação plausível: correspondente de consórcio, seguros e planos
 * de saúde, dez pessoas, três meses de histórico. Os números conversam
 * entre si — a receita do dashboard é a soma das faturas, a comissão sai
 * do contrato, o CSAT vem dos chamados encerrados. Um dado inventado por
 * tela faria a demonstração desmoronar na primeira pergunta.
 */

const ORG = 'org-nexor';
const hoje = new Date('2026-08-27T09:00:00-03:00');

/** Data relativa a "hoje" da demonstração, em ISO. */
function ha(dias: number, horas = 0): string {
  const d = new Date(hoje);
  d.setDate(d.getDate() - dias);
  d.setHours(d.getHours() - horas);
  return d.toISOString();
}

function em(dias: number): string {
  return ha(-dias);
}

/**
 * Data e hora exatas, relativas ao dia da demonstração.
 *
 * `ha()` desloca por dias inteiros — `setDate` trunca a fração, então
 * meio dia vira dia nenhum e todos os compromissos caíam no mesmo
 * horário. Aqui a hora é construída explicitamente, no fuso de Brasília,
 * para o calendário mostrar a semana como ela realmente seria.
 */
function diaHora(offsetDias: number, hora: number, minuto = 0): string {
  const d = new Date(hoje);
  d.setDate(d.getDate() + offsetDias);
  const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return new Date(`${data}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`).toISOString();
}

export const AGORA = hoje.toISOString();
/** Hora local da demonstração (America/Sao_Paulo). O servidor pode estar
    em UTC — ler `getHours()` do ISO daria três horas a mais. */
export const HORA_DEMO = 9;

/* ---------- Plataforma ---------- */

export const PLANOS: Plan[] = [
  {
    id: 'plano-starter',
    nome: 'Starter',
    tier: 'starter',
    precoMensal: 397,
    precoAnual: 3970,
    limites: {
      usuarios: 5,
      leadsPorMes: 1000,
      mensagensPorMes: 5000,
      interacoesIaPorMes: 1000,
      armazenamentoGb: 10,
      numerosWhatsapp: 1,
      automacoesAtivas: 5,
      chamadasApiPorMinuto: 60,
    },
    modulos: ['dashboard', 'leads', 'funil', 'clientes', 'conversas', 'tarefas', 'configuracoes'],
    addOns: ['intelligence', 'campanhas'],
  },
  {
    id: 'plano-growth',
    nome: 'Growth',
    tier: 'growth',
    precoMensal: 897,
    precoAnual: 8970,
    destaque: true,
    limites: {
      usuarios: 15,
      leadsPorMes: 5000,
      mensagensPorMes: 25000,
      interacoesIaPorMes: 8000,
      armazenamentoGb: 50,
      numerosWhatsapp: 3,
      automacoesAtivas: 25,
      chamadasApiPorMinuto: 120,
    },
    modulos: [
      'dashboard',
      'leads',
      'funil',
      'clientes',
      'conversas',
      'tarefas',
      'agenda',
      'cotacoes',
      'propostas',
      'produtos',
      'comissoes',
      'campanhas',
      'automacoes',
      'relatorios',
      'configuracoes',
    ],
    addOns: ['intelligence', 'partners', 'financeiro'],
  },
  {
    id: 'plano-scale',
    nome: 'Scale',
    tier: 'scale',
    precoMensal: 1897,
    precoAnual: 18970,
    limites: {
      usuarios: 50,
      leadsPorMes: 20000,
      mensagensPorMes: 120000,
      interacoesIaPorMes: 40000,
      armazenamentoGb: 250,
      numerosWhatsapp: 10,
      automacoesAtivas: 100,
      chamadasApiPorMinuto: 300,
    },
    modulos: [
      'dashboard',
      'intelligence',
      'leads',
      'funil',
      'clientes',
      'conversas',
      'email',
      'cotacoes',
      'propostas',
      'contratos',
      'produtos',
      'campanhas',
      'automacoes',
      'tarefas',
      'agenda',
      'financeiro',
      'comissoes',
      'partners',
      'suporte',
      'conhecimento',
      'relatorios',
      'integracoes',
      'configuracoes',
      'auditoria',
    ],
    addOns: [],
  },
  {
    id: 'plano-enterprise',
    nome: 'Enterprise',
    tier: 'enterprise',
    precoMensal: 4900,
    precoAnual: 49000,
    limites: {
      usuarios: null,
      leadsPorMes: null,
      mensagensPorMes: null,
      interacoesIaPorMes: null,
      armazenamentoGb: null,
      numerosWhatsapp: null,
      automacoesAtivas: null,
      chamadasApiPorMinuto: 1000,
    },
    modulos: [
      'dashboard',
      'intelligence',
      'leads',
      'funil',
      'clientes',
      'conversas',
      'email',
      'cotacoes',
      'propostas',
      'contratos',
      'produtos',
      'campanhas',
      'automacoes',
      'tarefas',
      'agenda',
      'financeiro',
      'comissoes',
      'partners',
      'suporte',
      'conhecimento',
      'relatorios',
      'integracoes',
      'configuracoes',
      'auditoria',
    ],
    addOns: [],
  },
];

export const ORGANIZACOES: Organization[] = [
  {
    id: ORG,
    nome: 'Nexor Consórcios e Seguros',
    documento: '18.442.907/0001-56',
    slug: 'nexor',
    status: 'ativa',
    planoId: 'plano-scale',
    segmento: ['consorcio', 'seguro', 'saude'],
    criadaEm: ha(412),
    modulosLiberados: PLANOS[2].modulos,
    responsavel: { nome: 'Rafael Yuri', email: 'rafael@nexor.com.br', telefone: '(11) 98812-4400' },
    mrr: 1897,
  },
  {
    id: 'org-atlas',
    nome: 'Atlas Corretora de Seguros',
    documento: '09.771.320/0001-08',
    slug: 'atlas',
    status: 'ativa',
    planoId: 'plano-growth',
    segmento: ['seguro'],
    criadaEm: ha(288),
    modulosLiberados: PLANOS[1].modulos,
    responsavel: { nome: 'Camila Prado', email: 'camila@atlascorretora.com.br', telefone: '(41) 99630-1120' },
    mrr: 897,
  },
  {
    id: 'org-vitta',
    nome: 'Vitta Saúde Benefícios',
    documento: '31.208.554/0001-71',
    slug: 'vitta',
    status: 'em_teste',
    planoId: 'plano-growth',
    segmento: ['saude'],
    criadaEm: ha(11),
    trialTerminaEm: em(3),
    modulosLiberados: PLANOS[1].modulos,
    responsavel: { nome: 'Bruno Tavares', email: 'bruno@vittasaude.com.br', telefone: '(31) 99114-7788' },
    mrr: 0,
  },
  {
    id: 'org-primeira',
    nome: 'Primeira Linha Consórcios',
    documento: '22.905.118/0001-33',
    slug: 'primeira-linha',
    status: 'inadimplente',
    planoId: 'plano-growth',
    segmento: ['consorcio'],
    criadaEm: ha(196),
    modulosLiberados: PLANOS[1].modulos,
    responsavel: { nome: 'Diego Nunes', email: 'diego@primeiralinha.com.br', telefone: '(62) 98220-4413' },
    mrr: 897,
  },
  {
    id: 'org-horizonte',
    nome: 'Horizonte Investimentos',
    documento: '44.180.663/0001-19',
    slug: 'horizonte',
    status: 'suspensa',
    planoId: 'plano-starter',
    segmento: ['financeiro'],
    criadaEm: ha(320),
    modulosLiberados: [],
    responsavel: { nome: 'Letícia Amaral', email: 'leticia@horizonteinv.com.br', telefone: '(21) 98455-2201' },
    mrr: 0,
  },
  {
    id: 'org-sul',
    nome: 'Sul Proteção Veicular',
    documento: '27.664.001/0001-90',
    slug: 'sul-protecao',
    status: 'ativa',
    planoId: 'plano-starter',
    segmento: ['seguro'],
    criadaEm: ha(74),
    modulosLiberados: PLANOS[0].modulos,
    responsavel: { nome: 'Marcos Vidal', email: 'marcos@sulprotecao.com.br', telefone: '(51) 99201-8874' },
    mrr: 397,
  },
];

export const CONSUMO: UsageSnapshot[] = [
  { organizationId: ORG, periodo: '2026-08', usuarios: 12, leads: 1842, mensagens: 38420, emails: 3106, interacoesIa: 11380, armazenamentoGb: 62, chamadasApi: 214880, automacoesExecutadas: 9412 },
  { organizationId: 'org-atlas', periodo: '2026-08', usuarios: 9, leads: 921, mensagens: 12440, emails: 1880, interacoesIa: 4102, armazenamentoGb: 18, chamadasApi: 44120, automacoesExecutadas: 3240 },
  { organizationId: 'org-vitta', periodo: '2026-08', usuarios: 4, leads: 188, mensagens: 2210, emails: 402, interacoesIa: 640, armazenamentoGb: 3, chamadasApi: 7120, automacoesExecutadas: 310 },
  { organizationId: 'org-primeira', periodo: '2026-08', usuarios: 11, leads: 1104, mensagens: 18220, emails: 1440, interacoesIa: 5980, armazenamentoGb: 27, chamadasApi: 61200, automacoesExecutadas: 4180 },
  { organizationId: 'org-sul', periodo: '2026-08', usuarios: 5, leads: 402, mensagens: 6140, emails: 320, interacoesIa: 1220, armazenamentoGb: 6, chamadasApi: 14400, automacoesExecutadas: 880 },
];

/* ---------- Pessoas ---------- */

export const USUARIOS: User[] = [
  { id: 'u-rafael', organizationId: ORG, createdAt: ha(412), nome: 'Rafael Yuri', email: 'admin@veyra.test', papel: 'administrador', ativo: true, doisFatoresAtivo: true, trocaSenhaObrigatoria: false, ultimoAcesso: ha(0, 1), avatarCor: 'linear-gradient(135deg,#18d8e8,#0b5cff)' },
  { id: 'u-carla', organizationId: ORG, createdAt: ha(380), nome: 'Carla Mendes', email: 'gestor@veyra.test', papel: 'gestor', ativo: true, doisFatoresAtivo: true, trocaSenhaObrigatoria: false, ultimoAcesso: ha(0, 2), avatarCor: 'linear-gradient(135deg,#7157ff,#0b5cff)' },
  { id: 'u-marcos', organizationId: ORG, createdAt: ha(300), nome: 'Marcos Ribeiro', email: 'supervisor@veyra.test', papel: 'supervisor', equipeId: 'eq-consorcio', ativo: true, doisFatoresAtivo: false, trocaSenhaObrigatoria: false, ultimoAcesso: ha(0, 3), avatarCor: 'linear-gradient(135deg,#2fa97c,#17a3b4)' },
  { id: 'u-julia', organizationId: ORG, createdAt: ha(240), nome: 'Júlia Campos', email: 'vendedor@veyra.test', papel: 'vendedor', equipeId: 'eq-consorcio', ativo: true, doisFatoresAtivo: false, trocaSenhaObrigatoria: false, ultimoAcesso: ha(0), avatarCor: 'linear-gradient(135deg,#bc7f20,#c2557e)' },
  { id: 'u-pedro', organizationId: ORG, createdAt: ha(210), nome: 'Pedro Almeida', email: 'pedro@nexor.com.br', papel: 'vendedor', equipeId: 'eq-seguros', ativo: true, doisFatoresAtivo: false, trocaSenhaObrigatoria: false, ultimoAcesso: ha(0, 5), avatarCor: 'linear-gradient(135deg,#4a80f0,#7157ff)' },
  { id: 'u-bianca', organizationId: ORG, createdAt: ha(180), nome: 'Bianca Rocha', email: 'bianca@nexor.com.br', papel: 'vendedor', equipeId: 'eq-saude', ativo: true, doisFatoresAtivo: false, trocaSenhaObrigatoria: false, ultimoAcesso: ha(1), avatarCor: 'linear-gradient(135deg,#c2557e,#7157ff)' },
  { id: 'u-tiago', organizationId: ORG, createdAt: ha(150), nome: 'Tiago Ferraz', email: 'financeiro@veyra.test', papel: 'financeiro', ativo: true, doisFatoresAtivo: true, trocaSenhaObrigatoria: false, ultimoAcesso: ha(0, 4), avatarCor: 'linear-gradient(135deg,#17a3b4,#2fa97c)' },
  { id: 'u-sofia', organizationId: ORG, createdAt: ha(140), nome: 'Sofia Lemos', email: 'suporte@veyra.test', papel: 'suporte', equipeId: 'eq-suporte', ativo: true, doisFatoresAtivo: false, trocaSenhaObrigatoria: false, ultimoAcesso: ha(0, 1), avatarCor: 'linear-gradient(135deg,#0b5cff,#18d8e8)' },
  { id: 'u-lucas', organizationId: ORG, createdAt: ha(96), nome: 'Lucas Prado', email: 'marketing@veyra.test', papel: 'marketing', ativo: true, doisFatoresAtivo: false, trocaSenhaObrigatoria: false, ultimoAcesso: ha(2), avatarCor: 'linear-gradient(135deg,#7157ff,#c2557e)' },
  { id: 'u-auditor', organizationId: ORG, createdAt: ha(60), nome: 'Renata Dias', email: 'auditor@veyra.test', papel: 'auditor', ativo: true, doisFatoresAtivo: true, trocaSenhaObrigatoria: false, ultimoAcesso: ha(6), avatarCor: 'linear-gradient(135deg,#8fa3bd,#5f748f)' },
];

export const EQUIPES: Team[] = [
  { id: 'eq-consorcio', organizationId: ORG, nome: 'Consórcio', supervisorId: 'u-marcos', membros: ['u-julia', 'u-marcos'] },
  { id: 'eq-seguros', organizationId: ORG, nome: 'Seguros', supervisorId: 'u-marcos', membros: ['u-pedro'] },
  { id: 'eq-saude', organizationId: ORG, nome: 'Saúde', supervisorId: 'u-carla', membros: ['u-bianca'] },
  { id: 'eq-suporte', organizationId: ORG, nome: 'Suporte', supervisorId: 'u-carla', membros: ['u-sofia'] },
];

export function usuarioPorId(id?: string): User | undefined {
  return USUARIOS.find((u) => u.id === id);
}

/* ---------- Pipelines ---------- */

export const PIPELINES: Pipeline[] = [
  {
    id: 'pipe-consorcio',
    organizationId: ORG,
    createdAt: ha(400),
    nome: 'Consórcio',
    segmento: 'consorcio',
    padrao: true,
    etapas: [
      { id: 'et-novo', nome: 'Novo lead', ordem: 1, cor: 'var(--chart-5)', probabilidade: 0.05 },
      { id: 'et-qualificacao', nome: 'Qualificação', ordem: 2, cor: 'var(--chart-1)', probabilidade: 0.15 },
      { id: 'et-interesse', nome: 'Interesse', ordem: 3, cor: 'var(--chart-1)', probabilidade: 0.3 },
      { id: 'et-cotacao', nome: 'Cotação', ordem: 4, cor: 'var(--chart-2)', probabilidade: 0.45 },
      { id: 'et-proposta', nome: 'Proposta', ordem: 5, cor: 'var(--chart-2)', probabilidade: 0.62 },
      { id: 'et-negociacao', nome: 'Negociação', ordem: 6, cor: 'var(--chart-4)', probabilidade: 0.75 },
      { id: 'et-documentacao', nome: 'Documentação', ordem: 7, cor: 'var(--chart-4)', probabilidade: 0.9 },
      { id: 'et-venda', nome: 'Venda', ordem: 8, cor: 'var(--chart-3)', probabilidade: 1 },
    ],
  },
  {
    id: 'pipe-seguro',
    organizationId: ORG,
    createdAt: ha(400),
    nome: 'Seguro',
    segmento: 'seguro',
    padrao: false,
    etapas: [
      { id: 'et-novo', nome: 'Novo lead', ordem: 1, cor: 'var(--chart-5)', probabilidade: 0.05 },
      { id: 'et-qualificacao', nome: 'Perfil de risco', ordem: 2, cor: 'var(--chart-1)', probabilidade: 0.2 },
      { id: 'et-cotacao', nome: 'Cotação multi-seguradora', ordem: 3, cor: 'var(--chart-2)', probabilidade: 0.4 },
      { id: 'et-proposta', nome: 'Proposta', ordem: 4, cor: 'var(--chart-2)', probabilidade: 0.6 },
      { id: 'et-vistoria', nome: 'Vistoria', ordem: 5, cor: 'var(--chart-4)', probabilidade: 0.82 },
      { id: 'et-venda', nome: 'Apólice emitida', ordem: 6, cor: 'var(--chart-3)', probabilidade: 1 },
    ],
  },
  {
    id: 'pipe-saude',
    organizationId: ORG,
    createdAt: ha(400),
    nome: 'Saúde',
    segmento: 'saude',
    padrao: false,
    etapas: [
      { id: 'et-novo', nome: 'Novo lead', ordem: 1, cor: 'var(--chart-5)', probabilidade: 0.05 },
      { id: 'et-qualificacao', nome: 'Elegibilidade', ordem: 2, cor: 'var(--chart-1)', probabilidade: 0.2 },
      { id: 'et-cotacao', nome: 'Cotação por faixa', ordem: 3, cor: 'var(--chart-2)', probabilidade: 0.42 },
      { id: 'et-proposta', nome: 'Proposta', ordem: 4, cor: 'var(--chart-2)', probabilidade: 0.6 },
      { id: 'et-documentacao', nome: 'Declaração de saúde', ordem: 5, cor: 'var(--chart-4)', probabilidade: 0.84 },
      { id: 'et-venda', nome: 'Contrato ativo', ordem: 6, cor: 'var(--chart-3)', probabilidade: 1 },
    ],
  },
];

/* ---------- Produtos ---------- */

export const PRODUTOS: Product[] = [
  { id: 'p-cons-auto', organizationId: ORG, createdAt: ha(400), nome: 'Consórcio Automóvel', segmento: 'consorcio', categoria: 'Automóvel', fornecedor: 'Rodobens', ativo: true, comissaoPadraoPercentual: 3.2, descricao: 'Cartas de R$ 40 mil a R$ 180 mil, prazos de 60 a 100 meses.' },
  { id: 'p-cons-imovel', organizationId: ORG, createdAt: ha(400), nome: 'Consórcio Imóvel', segmento: 'consorcio', categoria: 'Imóvel', fornecedor: 'Porto Consórcio', ativo: true, comissaoPadraoPercentual: 4.1, descricao: 'Cartas de R$ 120 mil a R$ 900 mil, prazos de 120 a 220 meses.' },
  { id: 'p-cons-pesado', organizationId: ORG, createdAt: ha(360), nome: 'Consórcio Pesados', segmento: 'consorcio', categoria: 'Caminhão e maquinário', fornecedor: 'Randon Consórcios', ativo: true, comissaoPadraoPercentual: 3.8 },
  { id: 'p-seg-auto', organizationId: ORG, createdAt: ha(400), nome: 'Seguro Auto', segmento: 'seguro', categoria: 'Automóvel', fornecedor: 'Porto Seguro', ativo: true, comissaoPadraoPercentual: 18, descricao: 'Cobertura compreensiva, terceiros e assistência 24h.' },
  { id: 'p-seg-vida', organizationId: ORG, createdAt: ha(400), nome: 'Seguro de Vida', segmento: 'seguro', categoria: 'Vida', fornecedor: 'Prudential', ativo: true, comissaoPadraoPercentual: 42, descricao: 'Morte, invalidez e doenças graves. Comissão recorrente por 24 meses.' },
  { id: 'p-seg-resid', organizationId: ORG, createdAt: ha(300), nome: 'Seguro Residencial', segmento: 'seguro', categoria: 'Patrimonial', fornecedor: 'Tokio Marine', ativo: true, comissaoPadraoPercentual: 22 },
  { id: 'p-saude-pme', organizationId: ORG, createdAt: ha(400), nome: 'Plano Empresarial PME', segmento: 'saude', categoria: 'Empresarial', fornecedor: 'Amil', ativo: true, comissaoPadraoPercentual: 90, descricao: 'De 2 a 99 vidas. Comissão de 90% da primeira mensalidade + 2% recorrente.' },
  { id: 'p-saude-adesao', organizationId: ORG, createdAt: ha(340), nome: 'Plano por Adesão', segmento: 'saude', categoria: 'Adesão', fornecedor: 'Unimed', ativo: true, comissaoPadraoPercentual: 110 },
  { id: 'p-saude-fam', organizationId: ORG, createdAt: ha(340), nome: 'Plano Familiar', segmento: 'saude', categoria: 'Familiar', fornecedor: 'SulAmérica', ativo: false, comissaoPadraoPercentual: 85 },
];

export function produtoPorId(id?: string): Product | undefined {
  return PRODUTOS.find((p) => p.id === id);
}

/* ---------- Leads ----------
   Vinte e quatro leads escritos à mão e o restante gerado por uma
   sequência determinística. A geração é determinística de propósito: a
   demonstração precisa mostrar o mesmo número duas vezes seguidas. */

const NOMES = [
  'Ana Beatriz Souza', 'Carlos Eduardo Lima', 'Fernanda Ramos', 'Gustavo Peixoto', 'Helena Martins',
  'Igor Salgado', 'Juliana Freitas', 'Kleber Antunes', 'Larissa Coelho', 'Marcelo Tavares',
  'Natália Bezerra', 'Otávio Guedes', 'Patrícia Nogueira', 'Rodrigo Vasques', 'Sabrina Duarte',
  'Thiago Barreto', 'Vanessa Pimentel', 'Wagner Fontes', 'Yasmin Correia', 'Alexandre Pontes',
  'Bruna Siqueira', 'César Andrade', 'Daniela Moraes', 'Eduardo Rangel', 'Flávia Teixeira',
  'Gabriel Moreno', 'Isabela Cunha', 'João Vitor Braga', 'Karina Lopes', 'Leandro Bastos',
  'Mariana Vidal', 'Nelson Cabral', 'Olívia Fagundes', 'Paulo Ricardo Neves', 'Renata Aguiar',
  'Samuel Queiroz', 'Tatiane Bueno', 'Ulisses Prado', 'Viviane Castro', 'William Sales',
  'Adriana Beltrão', 'Bernardo Lacerda', 'Clarice Monteiro', 'Douglas Xavier', 'Elaine Portela',
  'Fábio Toledo', 'Giovana Rezende', 'Henrique Barbosa', 'Ivone Cardoso', 'Jonas Medeiros',
];

/** Cidade, UF e DDD real — telefone com DDD de outro estado destoa na
    demonstração de quem conhece a região. */
const CIDADES: [string, string, number][] = [
  ['São Paulo', 'SP', 11], ['Campinas', 'SP', 19], ['Curitiba', 'PR', 41], ['Belo Horizonte', 'MG', 31],
  ['Porto Alegre', 'RS', 51], ['Goiânia', 'GO', 62], ['Rio de Janeiro', 'RJ', 21], ['Florianópolis', 'SC', 48],
  ['Ribeirão Preto', 'SP', 16], ['Uberlândia', 'MG', 34],
];

const ORIGENS: Lead['origem'][] = ['whatsapp', 'meta_ads', 'google_ads', 'site', 'indicacao', 'afiliado', 'instagram', 'telefone'];
const VENDEDORES = ['u-julia', 'u-pedro', 'u-bianca'];

interface EsbocoLead {
  status: Lead['status'];
  etapaId: string;
  score: number;
  segmento: Lead['segmento'];
  valor: number;
  diasAtras: number;
  semInteracaoDias: number;
}

/* A distribuição por etapa não é uniforme: um funil real afunila. */
const ESBOCOS: EsbocoLead[] = [
  /* O primeiro esboço é a lead da conversa em destaque: a IA acabou de
     qualificá-la, então ela ainda está em qualificação, mas já quente. */
  { status: 'quente', etapaId: 'et-qualificacao', score: 78, segmento: 'consorcio', valor: 150000, diasAtras: 0, semInteracaoDias: 0 },
  { status: 'novo', etapaId: 'et-novo', score: 31, segmento: 'seguro', valor: 4200, diasAtras: 0, semInteracaoDias: 0 },
  { status: 'novo', etapaId: 'et-novo', score: 18, segmento: 'saude', valor: 1180, diasAtras: 0, semInteracaoDias: 0 },
  { status: 'novo', etapaId: 'et-novo', score: 44, segmento: 'consorcio', valor: 150000, diasAtras: 1, semInteracaoDias: 1 },
  { status: 'em_qualificacao', etapaId: 'et-qualificacao', score: 51, segmento: 'consorcio', valor: 120000, diasAtras: 2, semInteracaoDias: 0 },
  { status: 'em_qualificacao', etapaId: 'et-qualificacao', score: 47, segmento: 'seguro', valor: 3800, diasAtras: 3, semInteracaoDias: 1 },
  { status: 'em_qualificacao', etapaId: 'et-qualificacao', score: 39, segmento: 'saude', valor: 2400, diasAtras: 3, semInteracaoDias: 2 },
  { status: 'qualificado', etapaId: 'et-interesse', score: 64, segmento: 'consorcio', valor: 180000, diasAtras: 5, semInteracaoDias: 1 },
  { status: 'qualificado', etapaId: 'et-interesse', score: 68, segmento: 'seguro', valor: 5600, diasAtras: 6, semInteracaoDias: 0 },
  { status: 'quente', etapaId: 'et-interesse', score: 87, segmento: 'consorcio', valor: 240000, diasAtras: 4, semInteracaoDias: 0 },
  { status: 'quente', etapaId: 'et-cotacao', score: 91, segmento: 'saude', valor: 4800, diasAtras: 7, semInteracaoDias: 1 },
  { status: 'cotacao', etapaId: 'et-cotacao', score: 74, segmento: 'consorcio', valor: 160000, diasAtras: 9, semInteracaoDias: 2 },
  { status: 'cotacao', etapaId: 'et-cotacao', score: 71, segmento: 'seguro', valor: 6200, diasAtras: 10, semInteracaoDias: 3 },
  { status: 'cotacao', etapaId: 'et-cotacao', score: 58, segmento: 'saude', valor: 3200, diasAtras: 11, semInteracaoDias: 4 },
  { status: 'proposta', etapaId: 'et-proposta', score: 82, segmento: 'consorcio', valor: 200000, diasAtras: 14, semInteracaoDias: 2 },
  { status: 'proposta', etapaId: 'et-proposta', score: 78, segmento: 'seguro', valor: 7400, diasAtras: 15, semInteracaoDias: 3 },
  { status: 'em_negociacao', etapaId: 'et-negociacao', score: 88, segmento: 'consorcio', valor: 300000, diasAtras: 18, semInteracaoDias: 1 },
  { status: 'em_negociacao', etapaId: 'et-negociacao', score: 85, segmento: 'saude', valor: 8900, diasAtras: 19, semInteracaoDias: 2 },
  { status: 'venda', etapaId: 'et-venda', score: 96, segmento: 'consorcio', valor: 150000, diasAtras: 22, semInteracaoDias: 1 },
  { status: 'venda', etapaId: 'et-venda', score: 94, segmento: 'seguro', valor: 5200, diasAtras: 24, semInteracaoDias: 2 },
  { status: 'sem_resposta', etapaId: 'et-qualificacao', score: 29, segmento: 'consorcio', valor: 80000, diasAtras: 26, semInteracaoDias: 9 },
  { status: 'nutricao', etapaId: 'et-qualificacao', score: 34, segmento: 'saude', valor: 1900, diasAtras: 31, semInteracaoDias: 12 },
  { status: 'perdido', etapaId: 'et-cotacao', score: 41, segmento: 'seguro', valor: 4400, diasAtras: 34, semInteracaoDias: 15 },
  { status: 'reativado', etapaId: 'et-interesse', score: 62, segmento: 'consorcio', valor: 110000, diasAtras: 40, semInteracaoDias: 1 },
];

const MOTIVOS_PERDA = ['Preço acima do orçamento', 'Fechou com concorrente', 'Adiou a decisão', 'Não tinha perfil de crédito', 'Perdeu o interesse'];

function temperaturaDoScore(score: number): Lead['temperatura'] {
  if (score >= 85) return 'fervendo';
  if (score >= 65) return 'quente';
  if (score >= 40) return 'morno';
  return 'frio';
}

function pipelineDoSegmento(segmento: Lead['segmento']): string {
  return segmento === 'seguro' ? 'pipe-seguro' : segmento === 'saude' ? 'pipe-saude' : 'pipe-consorcio';
}

function produtoDoSegmento(segmento: Lead['segmento'], i: number): string {
  const doSegmento = PRODUTOS.filter((p) => p.segmento === segmento);
  return doSegmento[i % doSegmento.length].id;
}

export const LEADS: Lead[] = ESBOCOS.flatMap((esboco, base) =>
  /* Cada esboço vira dois leads, variando cidade, origem e dono. Assim a
     lista tem 48 linhas sem 48 blocos escritos à mão. */
  [0, 1].map((repeticao) => {
    const i = base * 2 + repeticao;
    const [cidade, uf, ddd] = CIDADES[i % CIDADES.length];
    const nome = NOMES[i % NOMES.length];
    return {
      id: `lead-${String(i + 1).padStart(3, '0')}`,
      organizationId: ORG,
      createdAt: ha(esboco.diasAtras + repeticao),
      nome,
      telefone: `(${ddd}) 9${String(8000 + i * 137).slice(0, 4)}-${String(1000 + i * 91).slice(0, 4)}`,
      whatsapp: `55${ddd}9${String(8000 + i * 137).slice(0, 4)}${String(1000 + i * 91).slice(0, 4)}`,
      email: `${nome.split(' ')[0].toLowerCase()}.${nome.split(' ').at(-1)!.toLowerCase()}@email.com.br`,
      cidade,
      uf,
      origem: ORIGENS[i % ORIGENS.length],
      utm:
        ORIGENS[i % ORIGENS.length] === 'meta_ads'
          ? { source: 'facebook', medium: 'cpc', campaign: 'consorcio-agosto', content: 'video-30s' }
          : undefined,
      produtoId: produtoDoSegmento(esboco.segmento, i),
      segmento: esboco.segmento,
      valorEstimado: esboco.valor,
      score: Math.min(99, esboco.score + repeticao * 3),
      temperatura: temperaturaDoScore(esboco.score + repeticao * 3),
      responsavelId: VENDEDORES[i % VENDEDORES.length],
      equipeId: esboco.segmento === 'seguro' ? 'eq-seguros' : esboco.segmento === 'saude' ? 'eq-saude' : 'eq-consorcio',
      status: esboco.status,
      pipelineId: pipelineDoSegmento(esboco.segmento),
      etapaId: esboco.etapaId,
      ultimaInteracaoEm: ha(esboco.semInteracaoDias),
      proximaAtividadeEm: esboco.status === 'perdido' ? undefined : em((i % 4) + 1),
      motivoPerda: esboco.status === 'perdido' ? MOTIVOS_PERDA[i % MOTIVOS_PERDA.length] : undefined,
      campanhaId: ORIGENS[i % ORIGENS.length] === 'meta_ads' ? 'camp-001' : undefined,
    } satisfies Lead;
  }),
);

/* Alguns leads aparecem nominalmente nas telas de demonstração — na
   conversa, na cotação, na previsão. Estes ajustes garantem que o que a
   tela conta bate com o que o registro diz. */
const AJUSTES: Record<string, Partial<Lead>> = {
  'lead-001': { produtoId: 'p-cons-imovel', interesse: 'Entrada de apartamento', temperatura: 'quente' },
  'lead-019': { nome: 'Roberto Nakamura', produtoId: 'p-cons-auto' },
  'lead-021': { produtoId: 'p-seg-auto' },
  'lead-022': { produtoId: 'p-saude-pme' },
  'lead-035': { produtoId: 'p-cons-imovel' },
};

for (const lead of LEADS) {
  const ajuste = AJUSTES[lead.id];
  if (ajuste) Object.assign(lead, ajuste);
}

export function leadPorId(id?: string): Lead | undefined {
  return LEADS.find((l) => l.id === id);
}

/* ---------- Clientes ---------- */

export const CLIENTES: Customer[] = [
  { id: 'cli-001', responsavelId: 'u-julia', organizationId: ORG, createdAt: ha(340), nome: 'João Batista da Silva', documento: '482.117.900-31', tipo: 'pf', email: 'joao.silva@email.com.br', telefone: '(11) 98814-2203', whatsapp: '5511988142203', cidade: 'São Paulo', uf: 'SP', desde: ha(340), valorVitalicio: 42800, csatMedio: 4.8, tags: ['consórcio', 'contemplado', 'indicador'] },
  { id: 'cli-002', responsavelId: 'u-pedro', organizationId: ORG, createdAt: ha(288), nome: 'Marina Duarte Vasconcelos', documento: '311.904.556-08', tipo: 'pf', email: 'marina.duarte@email.com.br', telefone: '(41) 99612-8890', cidade: 'Curitiba', uf: 'PR', desde: ha(288), valorVitalicio: 18900, csatMedio: 5, tags: ['seguro auto', 'renovação'] },
  { id: 'cli-003', responsavelId: 'u-bianca', organizationId: ORG, createdAt: ha(210), nome: 'Construtora Alvorada Ltda', documento: '19.882.401/0001-72', tipo: 'pj', email: 'contato@alvoradaconstrutora.com.br', telefone: '(31) 3241-8800', cidade: 'Belo Horizonte', uf: 'MG', desde: ha(210), valorVitalicio: 128400, csatMedio: 4.2, tags: ['plano empresarial', '42 vidas', 'chave'] },
  { id: 'cli-004', responsavelId: 'u-pedro', organizationId: ORG, createdAt: ha(180), nome: 'Roberto Nakamura', documento: '204.556.119-44', tipo: 'pf', email: 'roberto.nakamura@email.com.br', telefone: '(11) 97722-4410', cidade: 'Campinas', uf: 'SP', desde: ha(180), valorVitalicio: 9600, csatMedio: 3.4, tags: ['seguro vida'] },
  { id: 'cli-005', responsavelId: 'u-julia', organizationId: ORG, createdAt: ha(150), nome: 'Cláudia Regina Pontes', documento: '667.203.844-90', tipo: 'pf', email: 'claudia.pontes@email.com.br', telefone: '(62) 98120-7745', cidade: 'Goiânia', uf: 'GO', desde: ha(150), valorVitalicio: 31200, csatMedio: 4.6, tags: ['consórcio imóvel'] },
  { id: 'cli-006', responsavelId: 'u-julia', organizationId: ORG, createdAt: ha(120), nome: 'Transportes Ferrari ME', documento: '27.114.005/0001-16', tipo: 'pj', email: 'financeiro@transportesferrari.com.br', telefone: '(51) 3025-4412', cidade: 'Porto Alegre', uf: 'RS', desde: ha(120), valorVitalicio: 76500, csatMedio: 4, tags: ['consórcio pesados', 'frota'] },
  { id: 'cli-007', responsavelId: 'u-bianca', organizationId: ORG, createdAt: ha(96), nome: 'Amanda Prado Lisboa', documento: '552.881.037-25', tipo: 'pf', email: 'amanda.lisboa@email.com.br', telefone: '(21) 99340-1188', cidade: 'Rio de Janeiro', uf: 'RJ', desde: ha(96), valorVitalicio: 14200, csatMedio: 5, tags: ['plano adesão'] },
  { id: 'cli-008', responsavelId: 'u-pedro', organizationId: ORG, createdAt: ha(64), nome: 'Eduardo Sampaio Vieira', documento: '890.114.622-70', tipo: 'pf', email: 'eduardo.vieira@email.com.br', telefone: '(48) 98807-3321', cidade: 'Florianópolis', uf: 'SC', desde: ha(64), valorVitalicio: 6800, csatMedio: 2.8, tags: ['seguro residencial', 'atenção'] },
];

export function clientePorId(id?: string): Customer | undefined {
  return CLIENTES.find((c) => c.id === id);
}

/* ---------- Contratos ---------- */

export const CONTRATOS: Contract[] = [
  {
    id: 'con-001', organizationId: ORG, createdAt: ha(330), numero: 'CTR-2025-0418', clienteId: 'cli-001', produtoId: 'p-cons-auto', segmento: 'consorcio',
    status: 'vigente', valor: 128000, vigenciaInicio: ha(330), renovaEm: em(240), assinadoEm: ha(330), responsavelId: 'u-julia',
    consorcio: { administradora: 'Rodobens', grupo: '4172', cota: '318', cartaCredito: 128000, prazoMeses: 80, parcela: 1842.4, taxaAdministracao: 17.5, fundoReserva: 2, lanceOfertado: 32000, lanceEmbutido: 25600, contemplado: true, contempladoEm: ha(96) },
  },
  {
    id: 'con-002', organizationId: ORG, createdAt: ha(280), numero: 'CTR-2025-0511', clienteId: 'cli-002', produtoId: 'p-seg-auto', segmento: 'seguro',
    status: 'renovacao', valor: 4820, vigenciaInicio: ha(280), vigenciaFim: em(18), renovaEm: em(18), assinadoEm: ha(280), responsavelId: 'u-pedro',
    apolice: { seguradora: 'Porto Seguro', apolice: '0531.88.114.0022', ramo: 'Automóvel', coberturas: [{ nome: 'Casco compreensivo', capital: 92000 }, { nome: 'Danos a terceiros', capital: 100000 }, { nome: 'Morte e invalidez', capital: 50000 }], franquia: 4600, premio: 4820, parcelas: 12, vigenciaInicio: ha(280), vigenciaFim: em(18), renovacaoAutomatica: false },
  },
  {
    id: 'con-003', organizationId: ORG, createdAt: ha(205), numero: 'CTR-2026-0102', clienteId: 'cli-003', produtoId: 'p-saude-pme', segmento: 'saude',
    status: 'vigente', valor: 38640, vigenciaInicio: ha(205), renovaEm: em(160), assinadoEm: ha(205), responsavelId: 'u-bianca',
    saude: { operadora: 'Amil', plano: 'Amil 400 QP Nacional', categoria: 'empresarial', acomodacao: 'apartamento', titular: 'Construtora Alvorada Ltda', dependentes: [], mensalidade: 38640, carenciaDias: 0, vigenciaInicio: ha(205), reajusteAniversario: em(160) },
  },
  {
    id: 'con-004', organizationId: ORG, createdAt: ha(175), numero: 'CTR-2026-0187', clienteId: 'cli-004', produtoId: 'p-seg-vida', segmento: 'seguro',
    status: 'vigente', valor: 3840, vigenciaInicio: ha(175), renovaEm: em(190), assinadoEm: ha(175), responsavelId: 'u-pedro',
    apolice: { seguradora: 'Prudential', apolice: 'PRU-9920-4471', ramo: 'Vida individual', coberturas: [{ nome: 'Morte qualquer causa', capital: 500000 }, { nome: 'Invalidez por acidente', capital: 250000 }, { nome: 'Doenças graves', capital: 150000 }], franquia: 0, premio: 3840, parcelas: 12, vigenciaInicio: ha(175), vigenciaFim: em(190), renovacaoAutomatica: true },
  },
  {
    id: 'con-005', organizationId: ORG, createdAt: ha(145), numero: 'CTR-2026-0231', clienteId: 'cli-005', produtoId: 'p-cons-imovel', segmento: 'consorcio',
    status: 'vigente', valor: 420000, vigenciaInicio: ha(145), renovaEm: em(1900), assinadoEm: ha(145), responsavelId: 'u-julia',
    consorcio: { administradora: 'Porto Consórcio', grupo: '8801', cota: '094', cartaCredito: 420000, prazoMeses: 200, parcela: 2604, taxaAdministracao: 21, fundoReserva: 2, contemplado: false },
  },
  {
    id: 'con-006', organizationId: ORG, createdAt: ha(118), numero: 'CTR-2026-0288', clienteId: 'cli-006', produtoId: 'p-cons-pesado', segmento: 'consorcio',
    status: 'vigente', valor: 380000, vigenciaInicio: ha(118), renovaEm: em(1500), assinadoEm: ha(118), responsavelId: 'u-julia',
    consorcio: { administradora: 'Randon Consórcios', grupo: '2214', cota: '441', cartaCredito: 380000, prazoMeses: 120, parcela: 3483, taxaAdministracao: 19, fundoReserva: 2, lanceOfertado: 76000, contemplado: false },
  },
  {
    id: 'con-007', organizationId: ORG, createdAt: ha(92), numero: 'CTR-2026-0344', clienteId: 'cli-007', produtoId: 'p-saude-adesao', segmento: 'saude',
    status: 'vigente', valor: 9480, vigenciaInicio: ha(92), renovaEm: em(273), assinadoEm: ha(92), responsavelId: 'u-bianca',
    saude: { operadora: 'Unimed', plano: 'Unimed Nacional Adesão', categoria: 'adesao', acomodacao: 'enfermaria', titular: 'Amanda Prado Lisboa', dependentes: [{ nome: 'Lívia Prado Lisboa', nascimento: '2018-04-11', parentesco: 'Filha' }], mensalidade: 790, carenciaDias: 180, vigenciaInicio: ha(92), reajusteAniversario: em(273) },
  },
  {
    id: 'con-008', organizationId: ORG, createdAt: ha(58), numero: 'CTR-2026-0401', clienteId: 'cli-008', produtoId: 'p-seg-resid', segmento: 'seguro',
    status: 'pendente', valor: 1680, vigenciaInicio: ha(58), vigenciaFim: em(307), renovaEm: em(307), responsavelId: 'u-pedro',
    apolice: { seguradora: 'Tokio Marine', apolice: 'TKM-4471-0092', ramo: 'Residencial', coberturas: [{ nome: 'Incêndio e raio', capital: 380000 }, { nome: 'Roubo de bens', capital: 40000 }], franquia: 1200, premio: 1680, parcelas: 6, vigenciaInicio: ha(58), vigenciaFim: em(307), renovacaoAutomatica: true },
  },
];

/* ---------- Cotações e propostas ---------- */

export const COTACOES: Quote[] = [
  {
    id: 'cot-001', organizationId: ORG, createdAt: ha(3), numero: 'COT-2026-0912', leadId: 'lead-019', clienteId: 'cli-001', segmento: 'consorcio', responsavelId: 'u-julia',
    status: 'visualizada', versao: 2, validaAte: em(7), enviadaEm: ha(2), visualizadaEm: ha(0, 6), linkPublico: 'veyra.app/c/9f2k4x',
    opcoes: [
      { id: 'o1', rotulo: 'Carta R$ 240.000 — 100 meses', fornecedor: 'Rodobens', valor: 240000, parcelas: 100, valorParcela: 2784, destaques: ['Taxa 17,5%', 'Sem lance embutido'] },
      { id: 'o2', rotulo: 'Carta R$ 240.000 — 80 meses', fornecedor: 'Porto Consórcio', valor: 240000, parcelas: 80, valorParcela: 3390, destaques: ['Taxa 19%', 'Lance embutido 30%'], recomendada: true },
      { id: 'o3', rotulo: 'Carta R$ 200.000 — 100 meses', fornecedor: 'Rodobens', valor: 200000, parcelas: 100, valorParcela: 2320, destaques: ['Parcela mais baixa'] },
    ],
  },
  {
    id: 'cot-002', organizationId: ORG, createdAt: ha(5), numero: 'COT-2026-0908', leadId: 'lead-021', segmento: 'seguro', responsavelId: 'u-pedro',
    status: 'enviada', versao: 1, validaAte: em(5), enviadaEm: ha(4), linkPublico: 'veyra.app/c/7h3m1p',
    opcoes: [
      { id: 'o1', rotulo: 'Compreensiva — franquia reduzida', fornecedor: 'Porto Seguro', valor: 6240, parcelas: 12, valorParcela: 520, destaques: ['Carro reserva 30 dias', 'Vidros inclusos'], recomendada: true },
      { id: 'o2', rotulo: 'Compreensiva — franquia normal', fornecedor: 'Tokio Marine', valor: 4980, parcelas: 12, valorParcela: 415, destaques: ['Franquia R$ 5.400'] },
    ],
  },
  {
    id: 'cot-003', organizationId: ORG, createdAt: ha(8), numero: 'COT-2026-0891', leadId: 'lead-022', segmento: 'saude', responsavelId: 'u-bianca',
    status: 'aprovada', versao: 3, validaAte: em(2), enviadaEm: ha(7), visualizadaEm: ha(6),
    opcoes: [
      { id: 'o1', rotulo: 'Amil 400 — 18 vidas', fornecedor: 'Amil', valor: 16560, parcelas: 12, valorParcela: 16560, destaques: ['Apartamento', 'Rede nacional'], recomendada: true },
      { id: 'o2', rotulo: 'SulAmérica Direto — 18 vidas', fornecedor: 'SulAmérica', valor: 13320, parcelas: 12, valorParcela: 13320, destaques: ['Enfermaria', 'Rede regional'] },
    ],
  },
  {
    id: 'cot-004', organizationId: ORG, createdAt: ha(12), numero: 'COT-2026-0870', leadId: 'lead-024', segmento: 'consorcio', responsavelId: 'u-julia',
    status: 'expirada', versao: 1, validaAte: ha(2), enviadaEm: ha(11),
    opcoes: [{ id: 'o1', rotulo: 'Carta R$ 160.000 — 80 meses', fornecedor: 'Rodobens', valor: 160000, parcelas: 80, valorParcela: 2260, destaques: [] }],
  },
];

export const PROPOSTAS: Proposal[] = [
  {
    id: 'prop-001', organizationId: ORG, createdAt: ha(9), numero: 'PRP-2026-0341', cotacaoId: 'cot-003', clienteId: 'cli-003', produtoId: 'p-saude-pme',
    segmento: 'saude', responsavelId: 'u-bianca', status: 'documentacao', valor: 16560, enviadaEm: ha(8),
    checklist: [
      { id: 'c1', descricao: 'Contrato social atualizado', obrigatorio: true, concluido: true, concluidoEm: ha(7) },
      { id: 'c2', descricao: 'Relação de vidas com CPF e data de nascimento', obrigatorio: true, concluido: true, concluidoEm: ha(6) },
      { id: 'c3', descricao: 'Declaração de saúde assinada por titular', obrigatorio: true, concluido: false },
      { id: 'c4', descricao: 'Comprovante de vínculo empregatício', obrigatorio: true, concluido: false },
      { id: 'c5', descricao: 'Cartão CNPJ', obrigatorio: false, concluido: true, concluidoEm: ha(7) },
    ],
  },
  {
    id: 'prop-002', organizationId: ORG, createdAt: ha(6), numero: 'PRP-2026-0349', cotacaoId: 'cot-001', clienteId: 'cli-001', produtoId: 'p-cons-auto',
    segmento: 'consorcio', responsavelId: 'u-julia', status: 'em_analise', valor: 240000, enviadaEm: ha(5),
    checklist: [
      { id: 'c1', descricao: 'RG e CPF', obrigatorio: true, concluido: true, concluidoEm: ha(5) },
      { id: 'c2', descricao: 'Comprovante de renda', obrigatorio: true, concluido: true, concluidoEm: ha(4) },
      { id: 'c3', descricao: 'Análise de crédito da administradora', obrigatorio: true, concluido: false },
    ],
  },
  {
    id: 'prop-003', organizationId: ORG, createdAt: ha(14), numero: 'PRP-2026-0322', clienteId: 'cli-005', produtoId: 'p-cons-imovel',
    segmento: 'consorcio', responsavelId: 'u-julia', status: 'aprovada', valor: 420000, enviadaEm: ha(13), decididaEm: ha(10),
    checklist: [
      { id: 'c1', descricao: 'RG e CPF', obrigatorio: true, concluido: true, concluidoEm: ha(12) },
      { id: 'c2', descricao: 'Comprovante de residência', obrigatorio: true, concluido: true, concluidoEm: ha(12) },
      { id: 'c3', descricao: 'Análise de crédito', obrigatorio: true, concluido: true, concluidoEm: ha(11) },
    ],
  },
  {
    id: 'prop-004', organizationId: ORG, createdAt: ha(21), numero: 'PRP-2026-0298', clienteId: 'cli-008', produtoId: 'p-seg-resid',
    segmento: 'seguro', responsavelId: 'u-pedro', status: 'recusada', valor: 2400, enviadaEm: ha(20), decididaEm: ha(17), motivoRecusa: 'Cliente optou por cobertura menor com outra corretora.',
    checklist: [{ id: 'c1', descricao: 'Questionário de risco', obrigatorio: true, concluido: true, concluidoEm: ha(19) }],
  },
];

/* ---------- Financeiro ---------- */

export const FATURAS: Invoice[] = [
  { id: 'fat-001', organizationId: ORG, createdAt: ha(32), numero: 'FT-2026-1841', clienteId: 'cli-001', contratoId: 'con-001', descricao: 'Parcela 11/80 — Consórcio Automóvel', valor: 1842.4, vencimento: ha(2), status: 'vencido', metodo: 'boleto' },
  { id: 'fat-002', organizationId: ORG, createdAt: ha(30), numero: 'FT-2026-1852', clienteId: 'cli-002', contratoId: 'con-002', descricao: 'Parcela 10/12 — Seguro Auto', valor: 401.67, vencimento: ha(4), status: 'pago', metodo: 'pix', pagoEm: ha(4) },
  { id: 'fat-003', organizationId: ORG, createdAt: ha(28), numero: 'FT-2026-1866', clienteId: 'cli-003', contratoId: 'con-003', descricao: 'Mensalidade agosto — 42 vidas', valor: 38640, vencimento: em(3), status: 'pendente', metodo: 'boleto', linkPagamento: 'veyra.app/p/38a91c' },
  { id: 'fat-004', organizationId: ORG, createdAt: ha(26), numero: 'FT-2026-1874', clienteId: 'cli-004', contratoId: 'con-004', descricao: 'Parcela 6/12 — Seguro de Vida', valor: 320, vencimento: ha(1), status: 'vencido', metodo: 'boleto' },
  { id: 'fat-005', organizationId: ORG, createdAt: ha(24), numero: 'FT-2026-1888', clienteId: 'cli-005', contratoId: 'con-005', descricao: 'Parcela 5/200 — Consórcio Imóvel', valor: 2604, vencimento: em(6), status: 'pendente', metodo: 'debito_automatico' },
  { id: 'fat-006', organizationId: ORG, createdAt: ha(22), numero: 'FT-2026-1901', clienteId: 'cli-006', contratoId: 'con-006', descricao: 'Parcela 4/120 — Consórcio Pesados', valor: 3483, vencimento: em(9), status: 'pendente', metodo: 'pix', linkPagamento: 'veyra.app/p/71f402' },
  { id: 'fat-007', organizationId: ORG, createdAt: ha(20), numero: 'FT-2026-1914', clienteId: 'cli-007', contratoId: 'con-007', descricao: 'Mensalidade agosto — Plano Adesão', valor: 790, vencimento: ha(6), status: 'pago', metodo: 'cartao', pagoEm: ha(6) },
  { id: 'fat-008', organizationId: ORG, createdAt: ha(18), numero: 'FT-2026-1922', clienteId: 'cli-008', contratoId: 'con-008', descricao: 'Parcela 2/6 — Seguro Residencial', valor: 280, vencimento: ha(9), status: 'vencido', metodo: 'boleto' },
  { id: 'fat-009', organizationId: ORG, createdAt: ha(16), numero: 'FT-2026-1938', clienteId: 'cli-001', contratoId: 'con-001', descricao: 'Parcela 10/80 — Consórcio Automóvel', valor: 1842.4, vencimento: ha(32), status: 'pago', metodo: 'boleto', pagoEm: ha(31) },
  { id: 'fat-010', organizationId: ORG, createdAt: ha(14), numero: 'FT-2026-1947', clienteId: 'cli-003', contratoId: 'con-003', descricao: 'Mensalidade julho — 42 vidas', valor: 38640, vencimento: ha(28), status: 'pago', metodo: 'boleto', pagoEm: ha(27) },
  { id: 'fat-011', organizationId: ORG, createdAt: ha(12), numero: 'FT-2026-1955', clienteId: 'cli-002', contratoId: 'con-002', descricao: 'Parcela 11/12 — Seguro Auto', valor: 401.67, vencimento: em(12), status: 'pendente', metodo: 'pix' },
  { id: 'fat-012', organizationId: ORG, createdAt: ha(10), numero: 'FT-2026-1963', clienteId: 'cli-005', contratoId: 'con-005', descricao: 'Parcela 4/200 — Consórcio Imóvel', valor: 2604, vencimento: ha(24), status: 'pago', metodo: 'debito_automatico', pagoEm: ha(24) },
];

export const CONTAS_PAGAR: Payable[] = [
  { id: 'pag-001', organizationId: ORG, createdAt: ha(20), fornecedor: 'Meta Platforms', categoria: 'Mídia paga', descricao: 'Investimento em anúncios — agosto', valor: 14800, vencimento: em(4), status: 'pendente' as const },
  { id: 'pag-002', organizationId: ORG, createdAt: ha(18), fornecedor: 'Google Ads', categoria: 'Mídia paga', descricao: 'Investimento em anúncios — agosto', valor: 9200, vencimento: em(4), status: 'pendente' as const },
  { id: 'pag-003', organizationId: ORG, createdAt: ha(16), fornecedor: 'VEYRA', categoria: 'Software', descricao: 'Assinatura Scale — agosto', valor: 1897, vencimento: em(8), status: 'pendente' as const },
  { id: 'pag-004', organizationId: ORG, createdAt: ha(14), fornecedor: 'Contabilidade Preciso', categoria: 'Serviços', descricao: 'Honorários contábeis', valor: 2400, vencimento: ha(3), status: 'pago' as const, pagoEm: ha(3) },
  { id: 'pag-005', organizationId: ORG, createdAt: ha(12), fornecedor: 'Equipe comercial', categoria: 'Comissões', descricao: 'Repasse de comissões — julho', valor: 38420, vencimento: ha(7), status: 'pago' as const, pagoEm: ha(7) },
  { id: 'pag-006', organizationId: ORG, createdAt: ha(8), fornecedor: 'Aluguel Sala 1204', categoria: 'Estrutura', descricao: 'Aluguel do escritório', valor: 6800, vencimento: em(6), status: 'pendente' as const },
];

export const FLUXO_CAIXA: CashFlowPoint[] = [
  { mes: 'Mar', entradas: 218400, saidas: 142800, saldo: 75600, previsto: false },
  { mes: 'Abr', entradas: 246200, saidas: 151400, saldo: 94800, previsto: false },
  { mes: 'Mai', entradas: 271800, saidas: 163200, saldo: 108600, previsto: false },
  { mes: 'Jun', entradas: 259300, saidas: 158900, saldo: 100400, previsto: false },
  { mes: 'Jul', entradas: 302700, saidas: 174600, saldo: 128100, previsto: false },
  { mes: 'Ago', entradas: 328900, saidas: 186200, saldo: 142700, previsto: false },
  { mes: 'Set', entradas: 341000, saidas: 192000, saldo: 149000, previsto: true },
  { mes: 'Out', entradas: 358000, saidas: 198500, saldo: 159500, previsto: true },
];

/* ---------- Comissões ---------- */

export const COMISSOES: Commission[] = [
  { id: 'com-001', organizationId: ORG, createdAt: ha(30), contratoId: 'con-005', beneficiarioId: 'u-julia', beneficiarioNome: 'Júlia Campos', beneficiarioTipo: 'vendedor', regraId: 'reg-cons', baseCalculo: 420000, percentual: 4.1, valor: 17220, competencia: '2026-07', status: 'paga', pagaEm: ha(7) },
  { id: 'com-002', organizationId: ORG, createdAt: ha(28), contratoId: 'con-006', beneficiarioId: 'u-julia', beneficiarioNome: 'Júlia Campos', beneficiarioTipo: 'vendedor', regraId: 'reg-cons', baseCalculo: 380000, percentual: 3.8, valor: 14440, competencia: '2026-07', status: 'paga', pagaEm: ha(7) },
  { id: 'com-003', organizationId: ORG, createdAt: ha(20), contratoId: 'con-003', beneficiarioId: 'u-bianca', beneficiarioNome: 'Bianca Rocha', beneficiarioTipo: 'vendedor', regraId: 'reg-saude', baseCalculo: 38640, percentual: 90, valor: 34776, competencia: '2026-08', status: 'aprovada' },
  { id: 'com-004', organizationId: ORG, createdAt: ha(18), contratoId: 'con-004', beneficiarioId: 'u-pedro', beneficiarioNome: 'Pedro Almeida', beneficiarioTipo: 'vendedor', regraId: 'reg-vida', baseCalculo: 3840, percentual: 42, valor: 1612.8, competencia: '2026-08', status: 'aprovada' },
  { id: 'com-005', organizationId: ORG, createdAt: ha(14), contratoId: 'con-002', beneficiarioId: 'u-pedro', beneficiarioNome: 'Pedro Almeida', beneficiarioTipo: 'vendedor', regraId: 'reg-auto', baseCalculo: 4820, percentual: 18, valor: 867.6, competencia: '2026-08', status: 'pendente' },
  { id: 'com-006', organizationId: ORG, createdAt: ha(12), contratoId: 'con-007', beneficiarioId: 'af-001', beneficiarioNome: 'Vitor Klein (afiliado)', beneficiarioTipo: 'afiliado', regraId: 'reg-afiliado', baseCalculo: 790, percentual: 55, valor: 434.5, competencia: '2026-08', status: 'pendente' },
  { id: 'com-007', organizationId: ORG, createdAt: ha(10), contratoId: 'con-001', beneficiarioId: 'u-marcos', beneficiarioNome: 'Marcos Ribeiro', beneficiarioTipo: 'supervisor', regraId: 'reg-override', baseCalculo: 128000, percentual: 0.5, valor: 640, competencia: '2026-08', status: 'aprovada' },
  { id: 'com-008', organizationId: ORG, createdAt: ha(40), contratoId: 'con-008', beneficiarioId: 'u-pedro', beneficiarioNome: 'Pedro Almeida', beneficiarioTipo: 'vendedor', regraId: 'reg-resid', baseCalculo: 1680, percentual: 22, valor: 369.6, competencia: '2026-07', status: 'estornada' },
  /* A comissão recorrente do plano de saúde gera uma parcela por mês
     enquanto o contrato durar — é o que o extrato precisa mostrar para
     o vendedor entender de onde vem o valor de cada competência. */
  { id: 'com-009', organizationId: ORG, createdAt: ha(50), contratoId: 'con-003', beneficiarioId: 'u-bianca', beneficiarioNome: 'Bianca Rocha', beneficiarioTipo: 'vendedor', regraId: 'reg-saude-rec', baseCalculo: 38640, percentual: 2, valor: 772.8, competencia: '2026-06', parcela: 1, status: 'paga', pagaEm: ha(40) },
  { id: 'com-010', organizationId: ORG, createdAt: ha(20), contratoId: 'con-003', beneficiarioId: 'u-bianca', beneficiarioNome: 'Bianca Rocha', beneficiarioTipo: 'vendedor', regraId: 'reg-saude-rec', baseCalculo: 38640, percentual: 2, valor: 772.8, competencia: '2026-07', parcela: 2, status: 'paga', pagaEm: ha(7) },
  { id: 'com-011', organizationId: ORG, createdAt: ha(2), contratoId: 'con-003', beneficiarioId: 'u-bianca', beneficiarioNome: 'Bianca Rocha', beneficiarioTipo: 'vendedor', regraId: 'reg-saude-rec', baseCalculo: 38640, percentual: 2, valor: 772.8, competencia: '2026-08', parcela: 3, status: 'pendente' },
  { id: 'com-012', organizationId: ORG, createdAt: ha(88), contratoId: 'con-001', beneficiarioId: 'u-julia', beneficiarioNome: 'Júlia Campos', beneficiarioTipo: 'vendedor', regraId: 'reg-cons', baseCalculo: 128000, percentual: 3.2, valor: 4096, competencia: '2026-05', status: 'paga', pagaEm: ha(80) },
  { id: 'com-013', organizationId: ORG, createdAt: ha(60), contratoId: 'con-005', beneficiarioId: 'u-marcos', beneficiarioNome: 'Marcos Ribeiro', beneficiarioTipo: 'supervisor', regraId: 'reg-override', baseCalculo: 420000, percentual: 0.5, valor: 2100, competencia: '2026-07', status: 'paga', pagaEm: ha(7) },
  { id: 'com-014', organizationId: ORG, createdAt: ha(30), contratoId: 'con-007', beneficiarioId: 'u-bianca', beneficiarioNome: 'Bianca Rocha', beneficiarioTipo: 'vendedor', regraId: 'reg-saude', baseCalculo: 790, percentual: 110, valor: 869, competencia: '2026-06', status: 'paga', pagaEm: ha(25) },
  { id: 'com-015', organizationId: ORG, createdAt: ha(15), contratoId: 'con-006', beneficiarioId: 'u-marcos', beneficiarioNome: 'Marcos Ribeiro', beneficiarioTipo: 'supervisor', regraId: 'reg-override', baseCalculo: 380000, percentual: 0.5, valor: 1900, competencia: '2026-08', status: 'aprovada' },
  { id: 'com-016', organizationId: ORG, createdAt: ha(10), contratoId: 'con-002', beneficiarioId: 'af-002', beneficiarioNome: 'Consultoria Meridiano (afiliado)', beneficiarioTipo: 'afiliado', regraId: 'reg-afiliado', baseCalculo: 4820, percentual: 55, valor: 477.18, competencia: '2026-08', status: 'aprovada' },
];

export const REGRAS_COMISSAO: CommissionRule[] = [
  { id: 'reg-cons', organizationId: ORG, createdAt: ha(400), nome: 'Consórcio — percentual da carta', base: 'percentual' as const, valor: 3.8, segmento: 'consorcio' as const, recorrenciaMeses: 1, ativa: true },
  { id: 'reg-saude', organizationId: ORG, createdAt: ha(400), nome: 'Saúde PME — 90% da primeira mensalidade', base: 'percentual' as const, valor: 90, segmento: 'saude' as const, recorrenciaMeses: 1, ativa: true },
  { id: 'reg-saude-rec', organizationId: ORG, createdAt: ha(400), nome: 'Saúde PME — 2% recorrente por 24 meses', base: 'recorrente' as const, valor: 2, segmento: 'saude' as const, recorrenciaMeses: 24, ativa: true },
  { id: 'reg-vida', organizationId: ORG, createdAt: ha(400), nome: 'Vida — 42% do prêmio anual', base: 'percentual' as const, valor: 42, produtoId: 'p-seg-vida', recorrenciaMeses: 1, ativa: true },
  { id: 'reg-auto', organizationId: ORG, createdAt: ha(400), nome: 'Auto — 18% do prêmio', base: 'percentual' as const, valor: 18, produtoId: 'p-seg-auto', recorrenciaMeses: 1, ativa: true },
  { id: 'reg-resid', organizationId: ORG, createdAt: ha(400), nome: 'Residencial — 22% do prêmio', base: 'percentual' as const, valor: 22, produtoId: 'p-seg-resid', recorrenciaMeses: 1, ativa: true },
  { id: 'reg-override', organizationId: ORG, createdAt: ha(400), nome: 'Override do supervisor — 0,5%', base: 'percentual' as const, valor: 0.5, papel: 'supervisor' as const, recorrenciaMeses: 1, ativa: true },
  { id: 'reg-afiliado', organizationId: ORG, createdAt: ha(400), nome: 'Afiliado — 55% da comissão da venda', base: 'percentual' as const, valor: 55, recorrenciaMeses: 1, ativa: true },
];

export const AFILIADOS: Affiliate[] = [
  { id: 'af-001', organizationId: ORG, createdAt: ha(180), nome: 'Vitor Klein', documento: '733.208.115-02', email: 'vitor.klein@email.com.br', telefone: '(47) 99820-1140', codigo: 'VKLEIN', linkExclusivo: 'veyra.app/i/VKLEIN', status: 'ativo', leadsGerados: 218, vendas: 31, comissaoAcumulada: 24880, saldoDisponivel: 3420 },
  { id: 'af-002', organizationId: ORG, createdAt: ha(140), nome: 'Consultoria Meridiano', documento: '38.220.114/0001-45', email: 'parcerias@meridiano.com.br', telefone: '(11) 3388-4120', codigo: 'MERID', linkExclusivo: 'veyra.app/i/MERID', status: 'ativo', leadsGerados: 402, vendas: 58, comissaoAcumulada: 61200, saldoDisponivel: 8940 },
  { id: 'af-003', organizationId: ORG, createdAt: ha(90), nome: 'Paula Meireles', documento: '441.902.336-88', email: 'paula.meireles@email.com.br', telefone: '(31) 98844-0021', codigo: 'PMEIRE', linkExclusivo: 'veyra.app/i/PMEIRE', status: 'ativo', leadsGerados: 96, vendas: 9, comissaoAcumulada: 7420, saldoDisponivel: 1180 },
  { id: 'af-004', organizationId: ORG, createdAt: ha(40), nome: 'Rede Prospera', documento: '52.117.909/0001-30', email: 'contato@redeprospera.com.br', telefone: '(62) 3222-9910', codigo: 'PROSP', linkExclusivo: 'veyra.app/i/PROSP', status: 'pendente', leadsGerados: 0, vendas: 0, comissaoAcumulada: 0, saldoDisponivel: 0 },
];

/* ---------- Conversas ---------- */

export const CONVERSAS: Conversation[] = [
  { id: 'cv-001', organizationId: ORG, createdAt: ha(0, 2), canal: 'whatsapp', contatoNome: 'Ana Beatriz Souza', contatoIdentificador: '5511988142203', leadId: 'lead-001', estado: 'ia_atendendo', naoLidas: 0, ultimaMensagem: 'Perfeito. Você prefere parcela menor ou prazo menor?', ultimaMensagemEm: ha(0, 0.05) },
  { id: 'cv-002', organizationId: ORG, createdAt: ha(0, 3), canal: 'whatsapp', contatoNome: 'Gustavo Peixoto', contatoIdentificador: '5541996128890', leadId: 'lead-004', estado: 'nao_lida', responsavelId: 'u-julia', naoLidas: 3, ultimaMensagem: 'Bom dia! Consegue me passar a simulação hoje?', ultimaMensagemEm: ha(0, 0.4) },
  { id: 'cv-003', organizationId: ORG, createdAt: ha(1), canal: 'whatsapp', contatoNome: 'João Batista da Silva', contatoIdentificador: '5511988142203', clienteId: 'cli-001', estado: 'humano_atendendo', responsavelId: 'u-julia', naoLidas: 0, ultimaMensagem: 'Vou verificar a data da assembleia e te retorno ainda hoje.', ultimaMensagemEm: ha(0, 1) },
  { id: 'cv-004', organizationId: ORG, createdAt: ha(1), canal: 'email', contatoNome: 'Construtora Alvorada Ltda', contatoIdentificador: 'contato@alvoradaconstrutora.com.br', clienteId: 'cli-003', estado: 'aguardando_cliente', responsavelId: 'u-bianca', naoLidas: 0, assunto: 'Declaração de saúde — pendência das 42 vidas', ultimaMensagem: 'Segue em anexo o modelo preenchido para os titulares.', ultimaMensagemEm: ha(0, 4) },
  { id: 'cv-005', organizationId: ORG, createdAt: ha(2), canal: 'whatsapp', contatoNome: 'Helena Martins', contatoIdentificador: '5531988440021', leadId: 'lead-010', estado: 'aguardando_vendedor', responsavelId: 'u-pedro', naoLidas: 1, ultimaMensagem: 'Fiquei de pensar. Me manda de novo na sexta?', ultimaMensagemEm: ha(1, 2) },
  { id: 'cv-006', organizationId: ORG, createdAt: ha(2), canal: 'instagram', contatoNome: '@larissa.coelho', contatoIdentificador: 'larissa.coelho', leadId: 'lead-013', estado: 'ia_atendendo', naoLidas: 0, ultimaMensagem: 'Trabalhamos com planos por adesão sim. Você tem vínculo com alguma entidade de classe?', ultimaMensagemEm: ha(0, 2) },
  { id: 'cv-007', organizationId: ORG, createdAt: ha(3), canal: 'whatsapp', contatoNome: 'Marina Duarte Vasconcelos', contatoIdentificador: '5541996128890', clienteId: 'cli-002', estado: 'encerrada', responsavelId: 'u-pedro', naoLidas: 0, ultimaMensagem: 'Obrigada pelo atendimento! Já recebi a apólice.', ultimaMensagemEm: ha(2, 3) },
  { id: 'cv-008', organizationId: ORG, createdAt: ha(4), canal: 'whatsapp', contatoNome: 'Eduardo Sampaio Vieira', contatoIdentificador: '5548988073321', clienteId: 'cli-008', estado: 'humano_atendendo', responsavelId: 'u-sofia', naoLidas: 2, ultimaMensagem: 'Continuo sem conseguir emitir a segunda via do boleto.', ultimaMensagemEm: ha(0, 6) },
];

export const MENSAGENS: Record<string, Message[]> = {
  'cv-001': [
    { id: 'm1', conversationId: 'cv-001', autor: 'cliente', tipo: 'texto', conteudo: 'Oi! Quero fazer um consórcio de 150 mil.', em: ha(0, 2), lida: true },
    { id: 'm2', conversationId: 'cv-001', autor: 'ia', autorNome: 'VEYRA AI', tipo: 'texto', conteudo: 'Olá, Ana! Que bom falar com você. Consórcio de R$ 150.000 — é para automóvel ou imóvel?', em: ha(0, 1.9), lida: true },
    { id: 'm3', conversationId: 'cv-001', autor: 'cliente', tipo: 'texto', conteudo: 'Imóvel. Pra dar entrada num apartamento.', em: ha(0, 1.8), lida: true },
    { id: 'm4', conversationId: 'cv-001', autor: 'ia', autorNome: 'VEYRA AI', tipo: 'texto', conteudo: 'Entendi. Para imóvel os prazos vão de 120 a 200 meses. Uma carta de R$ 150.000 em 180 meses fica em torno de R$ 1.040 por mês, já com taxa e fundo de reserva.', em: ha(0, 1.7), lida: true },
    { id: 'm5', conversationId: 'cv-001', autor: 'cliente', tipo: 'audio', conteudo: 'Áudio de 0:24 — transcrito: "Consigo pagar até mil e duzentos por mês, mas queria ser contemplada rápido."', anexo: { nome: 'audio-0024.ogg', tamanho: '78 KB' }, em: ha(0, 1.5), lida: true },
    { id: 'm6', conversationId: 'cv-001', autor: 'ia', autorNome: 'VEYRA AI', tipo: 'texto', conteudo: 'Anotado: teto de R$ 1.200 por mês e prioridade em contemplação rápida. Nesse caso vale considerar lance embutido — ele usa parte da própria carta como lance, sem dinheiro do bolso.', em: ha(0, 1.3), lida: true },
    { id: 'm7', conversationId: 'cv-001', autor: 'sistema', tipo: 'sistema', conteudo: 'Score atualizado de 44 para 78 · Temperatura: quente · Produto identificado: Consórcio Imóvel', em: ha(0, 1.25), lida: true },
    { id: 'm8', conversationId: 'cv-001', autor: 'cliente', tipo: 'texto', conteudo: 'Não sabia disso! Como funciona?', em: ha(0, 0.3), lida: true },
    { id: 'm9', conversationId: 'cv-001', autor: 'ia', autorNome: 'VEYRA AI', tipo: 'texto', conteudo: 'Perfeito. Você prefere parcela menor ou prazo menor?', em: ha(0, 0.05), lida: true },
  ],
  'cv-003': [
    { id: 'm1', conversationId: 'cv-003', autor: 'cliente', tipo: 'texto', conteudo: 'Júlia, bom dia! Saiu o resultado da assembleia?', em: ha(0, 3), lida: true },
    { id: 'm2', conversationId: 'cv-003', autor: 'usuario', autorNome: 'Júlia Campos', tipo: 'texto', conteudo: 'Bom dia, João! A assembleia do grupo 4172 é amanhã. Como você já foi contemplado em maio, essa é só a de encerramento do mês.', em: ha(0, 2.4), lida: true },
    { id: 'm3', conversationId: 'cv-003', autor: 'cliente', tipo: 'texto', conteudo: 'Ah sim. E a documentação do imóvel, já foi aprovada?', em: ha(0, 2), lida: true },
    { id: 'm4', conversationId: 'cv-003', autor: 'usuario', autorNome: 'Júlia Campos', tipo: 'texto', conteudo: 'Vou verificar a data da assembleia e te retorno ainda hoje.', em: ha(0, 1), lida: true },
  ],
  'cv-008': [
    { id: 'm1', conversationId: 'cv-008', autor: 'cliente', tipo: 'texto', conteudo: 'Boa tarde. Preciso da segunda via do boleto que venceu.', em: ha(0, 8), lida: true },
    { id: 'm2', conversationId: 'cv-008', autor: 'usuario', autorNome: 'Sofia Lemos', tipo: 'texto', conteudo: 'Boa tarde, Eduardo! Já gerei a segunda via com a nova data. Vou te enviar aqui.', em: ha(0, 7.4), lida: true },
    { id: 'm3', conversationId: 'cv-008', autor: 'usuario', autorNome: 'Sofia Lemos', tipo: 'documento', conteudo: 'boleto-FT-2026-1922.pdf', anexo: { nome: 'boleto-FT-2026-1922.pdf', tamanho: '112 KB' }, em: ha(0, 7.3), lida: true },
    { id: 'm4', conversationId: 'cv-008', autor: 'cliente', tipo: 'texto', conteudo: 'Continuo sem conseguir emitir a segunda via do boleto.', em: ha(0, 6), lida: false },
  ],
};

/* ---------- Suporte ---------- */

export const CHAMADOS: Ticket[] = [
  { id: 'tk-001', organizationId: ORG, createdAt: ha(0, 6), protocolo: 'VEY-2026-000184', clienteId: 'cli-008', assunto: 'Segunda via de boleto não abre', categoria: 'Financeiro', prioridade: 'alta', status: 'em_atendimento', responsavelId: 'u-sofia', equipeId: 'eq-suporte', abertoEm: ha(0, 6), primeiraRespostaEm: ha(0, 5.4), slaVenceEm: ha(0, 5), slaViolado: true },
  { id: 'tk-002', organizationId: ORG, createdAt: ha(0, 3), protocolo: 'VEY-2026-000185', clienteId: 'cli-003', assunto: 'Inclusão de 3 vidas no plano empresarial', categoria: 'Cadastro', prioridade: 'normal', status: 'aguardando_cliente', responsavelId: 'u-sofia', equipeId: 'eq-suporte', abertoEm: ha(0, 3), primeiraRespostaEm: ha(0, 2.6), slaVenceEm: em(0.17), slaViolado: false },
  { id: 'tk-003', organizationId: ORG, createdAt: ha(1), protocolo: 'VEY-2026-000182', clienteId: 'cli-001', assunto: 'Prazo para uso da carta contemplada', categoria: 'Consórcio', prioridade: 'normal', status: 'resolvido', responsavelId: 'u-sofia', equipeId: 'eq-suporte', abertoEm: ha(1), primeiraRespostaEm: ha(1), fechadoEm: ha(0, 20), slaVenceEm: ha(0, 20), slaViolado: false, solucao: 'Prazo de 180 dias contados da contemplação. Enviado o regulamento do grupo em PDF.' },
  { id: 'tk-004', organizationId: ORG, createdAt: ha(2), protocolo: 'VEY-2026-000179', clienteId: 'cli-004', assunto: 'Cancelamento de seguro de vida', categoria: 'Retenção', prioridade: 'critica', status: 'em_atendimento', responsavelId: 'u-sofia', equipeId: 'eq-suporte', abertoEm: ha(2), primeiraRespostaEm: ha(2), slaVenceEm: ha(1.9), slaViolado: true },
  { id: 'tk-005', organizationId: ORG, createdAt: ha(3), protocolo: 'VEY-2026-000176', clienteId: 'cli-002', assunto: 'Cópia da apólice renovada', categoria: 'Documentos', prioridade: 'baixa', status: 'encerrado', responsavelId: 'u-sofia', equipeId: 'eq-suporte', abertoEm: ha(3), primeiraRespostaEm: ha(3), fechadoEm: ha(2), slaVenceEm: ha(2), slaViolado: false, solucao: 'Apólice reenviada por e-mail e WhatsApp.' },
  { id: 'tk-006', organizationId: ORG, createdAt: ha(4), protocolo: 'VEY-2026-000171', clienteId: 'cli-007', assunto: 'Carência para consulta com especialista', categoria: 'Saúde', prioridade: 'normal', status: 'encerrado', responsavelId: 'u-sofia', equipeId: 'eq-suporte', abertoEm: ha(4), primeiraRespostaEm: ha(4), fechadoEm: ha(3), slaVenceEm: ha(3.8), slaViolado: false, solucao: 'Carência de 180 dias para especialista; liberada em 12/09.' },
  { id: 'tk-007', organizationId: ORG, createdAt: ha(0, 1), protocolo: 'VEY-2026-000186', clienteId: 'cli-006', assunto: 'Antecipação de parcelas do consórcio', categoria: 'Consórcio', prioridade: 'normal', status: 'novo', equipeId: 'eq-suporte', abertoEm: ha(0, 1), slaVenceEm: em(0.13), slaViolado: false },
];

export const CSAT: CsatResponse[] = [
  { id: 'cs-001', organizationId: ORG, createdAt: ha(0, 19), protocolo: 'VEY-2026-000182', clienteId: 'cli-001', nota: 5, comentario: 'Resposta rápida e clara. Recebi o regulamento em minutos.', atendenteId: 'u-sofia', equipeId: 'eq-suporte', canal: 'whatsapp', respondidoEm: ha(0, 19) },
  { id: 'cs-002', organizationId: ORG, createdAt: ha(2), protocolo: 'VEY-2026-000176', clienteId: 'cli-002', nota: 5, atendenteId: 'u-sofia', equipeId: 'eq-suporte', canal: 'email', respondidoEm: ha(2) },
  { id: 'cs-003', organizationId: ORG, createdAt: ha(3), protocolo: 'VEY-2026-000171', clienteId: 'cli-007', nota: 4, comentario: 'Bom atendimento, mas demorou um pouco para a primeira resposta.', atendenteId: 'u-sofia', equipeId: 'eq-suporte', canal: 'whatsapp', respondidoEm: ha(3) },
  { id: 'cs-004', organizationId: ORG, createdAt: ha(6), protocolo: 'VEY-2026-000164', clienteId: 'cli-008', nota: 2, comentario: 'Tive que explicar o problema três vezes.', atendenteId: 'u-sofia', equipeId: 'eq-suporte', canal: 'whatsapp', respondidoEm: ha(6) },
  { id: 'cs-005', organizationId: ORG, createdAt: ha(9), protocolo: 'VEY-2026-000152', clienteId: 'cli-005', nota: 5, atendenteId: 'u-sofia', equipeId: 'eq-suporte', canal: 'whatsapp', respondidoEm: ha(9) },
  { id: 'cs-006', organizationId: ORG, createdAt: ha(12), protocolo: 'VEY-2026-000141', clienteId: 'cli-004', nota: 3, comentario: 'Resolveram, mas o retorno foi só no dia seguinte.', atendenteId: 'u-sofia', equipeId: 'eq-suporte', canal: 'email', respondidoEm: ha(12) },
  { id: 'cs-007', organizationId: ORG, createdAt: ha(15), protocolo: 'VEY-2026-000133', clienteId: 'cli-003', nota: 5, atendenteId: 'u-sofia', equipeId: 'eq-suporte', canal: 'email', respondidoEm: ha(15) },
  { id: 'cs-008', organizationId: ORG, createdAt: ha(18), protocolo: 'VEY-2026-000128', clienteId: 'cli-006', nota: 4, atendenteId: 'u-sofia', equipeId: 'eq-suporte', canal: 'whatsapp', respondidoEm: ha(18) },
];

/* ---------- Campanhas, blacklist e automações ---------- */

export const CAMPANHAS: Campaign[] = [
  { id: 'camp-001', organizationId: ORG, createdAt: ha(24), nome: 'Consórcio Imóvel — agosto', canal: 'whatsapp', status: 'concluida', segmento: 'consorcio', metricas: { publico: 4820, enviadas: 4612, entregues: 4488, abertas: 3204, respondidas: 612, leadsGerados: 388, vendas: 21, receita: 186400, investimento: 14800 } },
  { id: 'camp-002', organizationId: ORG, createdAt: ha(16), nome: 'Renovação de seguro auto — 60 dias', canal: 'email', status: 'enviando', segmento: 'seguro', metricas: { publico: 1240, enviadas: 880, entregues: 861, abertas: 402, respondidas: 96, leadsGerados: 74, vendas: 8, receita: 42600, investimento: 0 } },
  { id: 'camp-003', organizationId: ORG, createdAt: ha(9), nome: 'Plano PME — empresas de 10 a 50 vidas', canal: 'whatsapp', status: 'agendada', segmento: 'saude', agendadaPara: em(2), metricas: { publico: 680, enviadas: 0, entregues: 0, abertas: 0, respondidas: 0, leadsGerados: 0, vendas: 0, receita: 0, investimento: 0 } },
  { id: 'camp-004', organizationId: ORG, createdAt: ha(48), nome: 'Reativação — leads sem resposta há 90 dias', canal: 'whatsapp', status: 'concluida', metricas: { publico: 2140, enviadas: 2140, entregues: 2016, abertas: 1102, respondidas: 188, leadsGerados: 141, vendas: 6, receita: 38900, investimento: 3200 } },
  { id: 'camp-005', organizationId: ORG, createdAt: ha(4), nome: 'Indique e ganhe — clientes contemplados', canal: 'whatsapp', status: 'rascunho', metricas: { publico: 312, enviadas: 0, entregues: 0, abertas: 0, respondidas: 0, leadsGerados: 0, vendas: 0, receita: 0, investimento: 0 } },
];

export const BLACKLIST: BlacklistEntry[] = [
  { id: 'bl-001', organizationId: ORG, createdAt: ha(12), contato: '5511977884412', nome: 'Sérgio Bittencourt', canal: 'todos', motivo: 'Pediu para não receber mais ofertas comerciais.', solicitadoEm: ha(12), registradoPor: 'VEYRA AI', origem: 'ia' },
  { id: 'bl-002', organizationId: ORG, createdAt: ha(28), contato: 'roberta.lins@email.com.br', nome: 'Roberta Lins', canal: 'email', motivo: 'Descadastro pelo link do rodapé.', solicitadoEm: ha(28), registradoPor: 'Sistema', origem: 'cliente' },
  { id: 'bl-003', organizationId: ORG, createdAt: ha(41), contato: '5521994402218', nome: 'Fábio Gonçalves', canal: 'whatsapp', motivo: 'Solicitou remoção durante ligação. Registrado pelo operador.', solicitadoEm: ha(41), registradoPor: 'Pedro Almeida', origem: 'operador' },
  { id: 'bl-004', organizationId: ORG, createdAt: ha(60), contato: '5531988112204', canal: 'todos', motivo: 'Importação de lista de opt-out da campanha anterior.', solicitadoEm: ha(60), registradoPor: 'Lucas Prado', origem: 'importacao' },
  { id: 'bl-005', organizationId: ORG, createdAt: ha(88), contato: 'marcelo.duarte@email.com.br', nome: 'Marcelo Duarte', canal: 'email', motivo: 'Pedido de exclusão de dados (LGPD, art. 18).', solicitadoEm: ha(88), registradoPor: 'Rafael Yuri', origem: 'cliente' },
];

export const AUTOMACOES: Automation[] = [
  {
    id: 'aut-001', organizationId: ORG, createdAt: ha(120), nome: 'Triagem e distribuição de lead novo', gatilho: 'lead_criado', ativa: true, execucoes30d: 1842, sucesso30d: 1818,
    nos: [
      { id: 'n1', tipo: 'gatilho', rotulo: 'Lead criado', detalhe: 'Qualquer origem' },
      { id: 'n2', tipo: 'acao', rotulo: 'Acionar VEYRA AI', detalhe: 'Triagem e qualificação', acao: 'acionar_ia' },
      { id: 'n3', tipo: 'condicao', rotulo: 'Score maior que 80?' },
      { id: 'n4', tipo: 'acao', rotulo: 'Distribuir para vendedor', detalhe: 'Rodízio na equipe do segmento', acao: 'distribuir_vendedor' },
      { id: 'n5', tipo: 'acao', rotulo: 'Criar tarefa', detalhe: 'Ligar em até 15 minutos', acao: 'criar_tarefa' },
      { id: 'n6', tipo: 'acao', rotulo: 'Notificar supervisor', detalhe: 'Notificação interna', acao: 'notificar' },
    ],
  },
  {
    id: 'aut-002', organizationId: ORG, createdAt: ha(96), nome: 'Cadência de follow-up — sem resposta', gatilho: 'sem_resposta', ativa: true, execucoes30d: 964, sucesso30d: 951,
    nos: [
      { id: 'n1', tipo: 'gatilho', rotulo: 'Lead sem resposta há 24h' },
      { id: 'n2', tipo: 'acao', rotulo: 'Mensagem dia 1', detalhe: 'Retomada leve', acao: 'enviar_whatsapp' },
      { id: 'n3', tipo: 'espera', rotulo: 'Aguardar 2 dias' },
      { id: 'n4', tipo: 'acao', rotulo: 'Mensagem dia 3', detalhe: 'Prova social', acao: 'enviar_whatsapp' },
      { id: 'n5', tipo: 'espera', rotulo: 'Aguardar 2 dias' },
      { id: 'n6', tipo: 'acao', rotulo: 'Mensagem dia 5', detalhe: 'Última tentativa com oferta', acao: 'enviar_whatsapp' },
      { id: 'n7', tipo: 'espera', rotulo: 'Aguardar 2 dias' },
      { id: 'n8', tipo: 'acao', rotulo: 'Mover para nutrição', detalhe: 'Status: sem resposta', acao: 'mudar_status' },
    ],
  },
  {
    id: 'aut-003', organizationId: ORG, createdAt: ha(72), nome: 'Aviso de renovação — 60 dias', gatilho: 'renovacao_proxima', ativa: true, execucoes30d: 148, sucesso30d: 148,
    nos: [
      { id: 'n1', tipo: 'gatilho', rotulo: 'Contrato renova em 60 dias' },
      { id: 'n2', tipo: 'acao', rotulo: 'Criar tarefa para o responsável', acao: 'criar_tarefa' },
      { id: 'n3', tipo: 'acao', rotulo: 'Enviar e-mail de renovação', acao: 'enviar_email' },
    ],
  },
  {
    id: 'aut-004', organizationId: ORG, createdAt: ha(60), nome: 'CSAT baixo escala para o gestor', gatilho: 'csat_baixo', ativa: true, execucoes30d: 12, sucesso30d: 12,
    nos: [
      { id: 'n1', tipo: 'gatilho', rotulo: 'CSAT respondido com nota ≤ 3' },
      { id: 'n2', tipo: 'acao', rotulo: 'Notificar gestor', acao: 'notificar' },
      { id: 'n3', tipo: 'acao', rotulo: 'Abrir chamado de retenção', detalhe: 'Prioridade alta', acao: 'criar_tarefa' },
    ],
  },
  {
    id: 'aut-005', organizationId: ORG, createdAt: ha(40), nome: 'Pedido de não contato entra na blacklist', gatilho: 'mensagem_recebida', ativa: true, execucoes30d: 34, sucesso30d: 34,
    nos: [
      { id: 'n1', tipo: 'gatilho', rotulo: 'Mensagem recebida' },
      { id: 'n2', tipo: 'condicao', rotulo: 'Intenção = pedido de descadastro' },
      { id: 'n3', tipo: 'acao', rotulo: 'Registrar na blacklist', detalhe: 'Com data, canal e motivo', acao: 'adicionar_blacklist' },
      { id: 'n4', tipo: 'acao', rotulo: 'Confirmar ao cliente', acao: 'enviar_whatsapp' },
    ],
  },
  {
    id: 'aut-006', organizationId: ORG, createdAt: ha(28), nome: 'Boleto vencido — régua de cobrança', gatilho: 'vencimento_proximo', ativa: false, execucoes30d: 0, sucesso30d: 0,
    nos: [
      { id: 'n1', tipo: 'gatilho', rotulo: 'Fatura vence em 3 dias' },
      { id: 'n2', tipo: 'acao', rotulo: 'Lembrete com link de pagamento', acao: 'enviar_whatsapp' },
      { id: 'n3', tipo: 'espera', rotulo: 'Aguardar até o vencimento' },
      { id: 'n4', tipo: 'condicao', rotulo: 'Continua em aberto?' },
      { id: 'n5', tipo: 'acao', rotulo: 'Notificar financeiro', acao: 'notificar' },
    ],
  },
];

/* ---------- Tarefas ---------- */

export const TAREFAS: Task[] = [
  { id: 'tar-001', organizationId: ORG, createdAt: ha(0, 2), titulo: 'Ligar para Gustavo Peixoto — simulação prometida', responsavelId: 'u-julia', leadId: 'lead-004', vence: ha(0, -2), concluida: false, prioridade: 'alta', tipo: 'ligacao' },
  { id: 'tar-002', organizationId: ORG, createdAt: ha(0, 4), titulo: 'Enviar comparativo de 3 seguradoras para Helena', responsavelId: 'u-pedro', leadId: 'lead-010', vence: em(0.2), concluida: false, prioridade: 'normal', tipo: 'whatsapp' },
  { id: 'tar-003', organizationId: ORG, createdAt: ha(1), titulo: 'Cobrar declaração de saúde — Construtora Alvorada', responsavelId: 'u-bianca', clienteId: 'cli-003', vence: em(1), concluida: false, prioridade: 'alta', tipo: 'email' },
  { id: 'tar-004', organizationId: ORG, createdAt: ha(2), titulo: 'Reunião de renovação — Marina Duarte', responsavelId: 'u-pedro', clienteId: 'cli-002', vence: em(2), concluida: false, prioridade: 'normal', tipo: 'reuniao' },
  { id: 'tar-005', organizationId: ORG, createdAt: ha(3), titulo: 'Retenção — Roberto Nakamura pediu cancelamento', responsavelId: 'u-sofia', clienteId: 'cli-004', vence: ha(0, 3), concluida: false, prioridade: 'critica', tipo: 'ligacao' },
  { id: 'tar-006', organizationId: ORG, createdAt: ha(4), titulo: 'Enviar segunda via corrigida — Eduardo Vieira', responsavelId: 'u-sofia', clienteId: 'cli-008', vence: em(0.1), concluida: false, prioridade: 'alta', tipo: 'documento' },
  { id: 'tar-007', organizationId: ORG, createdAt: ha(5), titulo: 'Conferir análise de crédito — proposta PRP-2026-0349', responsavelId: 'u-julia', clienteId: 'cli-001', vence: em(1), concluida: false, prioridade: 'normal', tipo: 'documento' },
  { id: 'tar-008', organizationId: ORG, createdAt: ha(6), titulo: 'Fechar comissões da competência 08/2026', responsavelId: 'u-tiago', vence: em(4), concluida: false, prioridade: 'normal', tipo: 'outro' },
  { id: 'tar-009', organizationId: ORG, createdAt: ha(8), titulo: 'Revisar público da campanha PME', responsavelId: 'u-lucas', vence: em(1), concluida: false, prioridade: 'normal', tipo: 'outro' },
  { id: 'tar-010', organizationId: ORG, createdAt: ha(9), titulo: 'Enviar apólice renovada para Marina', responsavelId: 'u-pedro', clienteId: 'cli-002', vence: ha(2), concluida: true, concluidaEm: ha(2), prioridade: 'normal', tipo: 'email' },
];

/* ---------- Agenda ---------- */

export const COMPROMISSOS: Appointment[] = [
  { id: 'ag-001', organizationId: ORG, createdAt: ha(4), titulo: 'Alinhamento semanal do comercial', tipo: 'interno', responsavelId: 'u-carla', inicia: diaHora(-3, 9), termina: diaHora(-3, 10), local: 'Sala 1204' },
  { id: 'ag-002', organizationId: ORG, createdAt: ha(4), titulo: 'Treinamento — objeções de consórcio', tipo: 'interno', responsavelId: 'u-marcos', inicia: diaHora(-2, 14), termina: diaHora(-2, 15, 30), local: 'Sala 1204' },
  { id: 'ag-003', organizationId: ORG, createdAt: ha(5), titulo: 'Visita técnica — Transportes Ferrari', tipo: 'visita', responsavelId: 'u-julia', clienteId: 'cli-006', inicia: diaHora(-1, 9, 30), termina: diaHora(-1, 12), local: 'Porto Alegre/RS' },
  { id: 'ag-004', organizationId: ORG, createdAt: ha(1), titulo: 'Retenção — Roberto Nakamura', tipo: 'ligacao', responsavelId: 'u-sofia', clienteId: 'cli-004', inicia: diaHora(0, 9, 30), termina: diaHora(0, 9, 45), automatico: true },
  { id: 'ag-005', organizationId: ORG, createdAt: ha(1), titulo: 'Ligar para Gustavo Peixoto', tipo: 'ligacao', responsavelId: 'u-julia', leadId: 'lead-007', inicia: diaHora(0, 11), termina: diaHora(0, 11, 15), automatico: true },
  { id: 'ag-006', organizationId: ORG, createdAt: ha(2), titulo: 'Apresentação de plano PME — Alvorada', tipo: 'reuniao', responsavelId: 'u-bianca', clienteId: 'cli-003', inicia: diaHora(0, 16), termina: diaHora(0, 17), local: 'Escritório do cliente' },
  { id: 'ag-007', organizationId: ORG, createdAt: ha(1), titulo: 'Assembleia do grupo 4172', tipo: 'assembleia', responsavelId: 'u-julia', clienteId: 'cli-001', inicia: diaHora(1, 10), termina: diaHora(1, 11), local: 'Rodobens · online' },
  { id: 'ag-008', organizationId: ORG, createdAt: ha(3), titulo: 'Reunião de renovação — Marina Duarte', tipo: 'reuniao', responsavelId: 'u-pedro', clienteId: 'cli-002', inicia: diaHora(1, 14), termina: diaHora(1, 15), local: 'Google Meet' },
  { id: 'ag-009', organizationId: ORG, createdAt: ha(2), titulo: 'Fechamento de comissões — competência 08', tipo: 'interno', responsavelId: 'u-tiago', inicia: diaHora(1, 17), termina: diaHora(1, 18) },
  { id: 'ag-010', organizationId: ORG, createdAt: ha(6), titulo: 'Plantão de vendas — feirão de consórcio', tipo: 'visita', responsavelId: 'u-julia', inicia: diaHora(2, 9), termina: diaHora(2, 13), local: 'Shopping Anália Franco' },
];

/* ---------- Recebimentos ----------
   As faturas já pagas trazem o recebimento correspondente, para que o
   histórico do modal não comece vazio em cima de uma fatura quitada. */

export const PAGAMENTOS: PaymentRecord[] = [
  { id: 'pg-001', organizationId: ORG, createdAt: ha(4), invoiceId: 'fat-002', metodo: 'pix', valor: 401.67, recebidoEm: ha(4), registradoPor: 'Baixa automática', referenciaExterna: 'E18236120260823' },
  { id: 'pg-002', organizationId: ORG, createdAt: ha(6), invoiceId: 'fat-007', metodo: 'cartao', valor: 790, recebidoEm: ha(6), registradoPor: 'Baixa automática', referenciaExterna: 'ch_3PqL29KcM' },
  { id: 'pg-003', organizationId: ORG, createdAt: ha(31), invoiceId: 'fat-009', metodo: 'boleto', valor: 1842.4, recebidoEm: ha(31), registradoPor: 'Tiago Ferraz' },
  { id: 'pg-004', organizationId: ORG, createdAt: ha(27), invoiceId: 'fat-010', metodo: 'boleto', valor: 38640, recebidoEm: ha(27), registradoPor: 'Baixa automática', referenciaExterna: '34191790010104351004791020150008' },
  { id: 'pg-005', organizationId: ORG, createdAt: ha(24), invoiceId: 'fat-012', metodo: 'debito_automatico', valor: 2604, recebidoEm: ha(24), registradoPor: 'Baixa automática' },
  /* A parcela do consórcio do João foi paga pela metade: é o caso que
     mostra o recebimento parcial no modal do financeiro. */
  { id: 'pg-006', organizationId: ORG, createdAt: ha(1), invoiceId: 'fat-001', metodo: 'pix', valor: 900, recebidoEm: ha(1), registradoPor: 'Tiago Ferraz', observacao: 'Cliente pediu para dividir em duas entradas.' },
];

/* ---------- Integrações ---------- */

export const INTEGRACOES: Integration[] = [
  { id: 'int-001', organizationId: ORG, createdAt: ha(400), chave: 'whatsapp_oficial', nome: 'WhatsApp Business API', categoria: 'mensageria', status: 'conectado', ultimaSincronizacao: ha(0, 0.02) },
  { id: 'int-002', organizationId: ORG, createdAt: ha(380), chave: 'evolution_api', nome: 'Evolution API', categoria: 'mensageria', status: 'conectado', ultimaSincronizacao: ha(0, 0.05) },
  { id: 'int-003', organizationId: ORG, createdAt: ha(360), chave: 'smtp', nome: 'SMTP — envio de e-mail', categoria: 'mensageria', status: 'conectado', ultimaSincronizacao: ha(0, 0.3) },
  { id: 'int-004', organizationId: ORG, createdAt: ha(360), chave: 'imap', nome: 'IMAP — caixa compartilhada', categoria: 'mensageria', status: 'conectado', ultimaSincronizacao: ha(0, 0.2) },
  { id: 'int-005', organizationId: ORG, createdAt: ha(320), chave: 'meta_ads', nome: 'Meta Ads', categoria: 'midia', status: 'conectado', ultimaSincronizacao: ha(0, 1) },
  { id: 'int-006', organizationId: ORG, createdAt: ha(320), chave: 'google_ads', nome: 'Google Ads', categoria: 'midia', status: 'erro', ultimaSincronizacao: ha(2), mensagemErro: 'Token de atualização expirado. Reautorize a conta de anúncios.' },
  { id: 'int-007', organizationId: ORG, createdAt: ha(300), chave: 'instagram', nome: 'Instagram Direct', categoria: 'mensageria', status: 'conectado', ultimaSincronizacao: ha(0, 0.4) },
  { id: 'int-008', organizationId: ORG, createdAt: ha(280), chave: 'gateway_pagamento', nome: 'Asaas — cobranças', categoria: 'pagamento', status: 'conectado', ultimaSincronizacao: ha(0, 0.1) },
  { id: 'int-009', organizationId: ORG, createdAt: ha(280), chave: 'pix', nome: 'PIX — recebimento', categoria: 'pagamento', status: 'conectado', ultimaSincronizacao: ha(0, 0.1) },
  { id: 'int-010', organizationId: ORG, createdAt: ha(240), chave: 'administradora_api', nome: 'Rodobens — consulta de grupos', categoria: 'produto', status: 'conectado', ultimaSincronizacao: ha(0, 6) },
  { id: 'int-011', organizationId: ORG, createdAt: ha(220), chave: 'seguradora_api', nome: 'Porto Seguro — cotação', categoria: 'produto', status: 'configurando' },
  { id: 'int-012', organizationId: ORG, createdAt: ha(200), chave: 'operadora_api', nome: 'Amil — tabela de preços', categoria: 'produto', status: 'desconectado' },
  { id: 'int-013', organizationId: ORG, createdAt: ha(180), chave: 'n8n', nome: 'n8n — automações externas', categoria: 'automacao', status: 'conectado', ultimaSincronizacao: ha(0, 2) },
  { id: 'int-014', organizationId: ORG, createdAt: ha(160), chave: 'webhook', nome: 'Webhooks de saída', categoria: 'sistema', status: 'conectado', ultimaSincronizacao: ha(0, 0.03) },
  { id: 'int-015', organizationId: ORG, createdAt: ha(120), chave: 'erp', nome: 'ERP contábil', categoria: 'sistema', status: 'desconectado' },
];

/* ---------- Conhecimento ---------- */

export const CONHECIMENTO: KnowledgeArticle[] = [
  { id: 'kb-001', organizationId: ORG, createdAt: ha(300), titulo: 'O que é lance embutido e quando vale a pena', categoria: 'Produto', segmento: 'consorcio', conteudo: 'O lance embutido usa parte da própria carta de crédito como lance...', aprovado: true, usosPelaIa: 1284, atualizadoEm: ha(30), autor: 'Marcos Ribeiro' },
  { id: 'kb-002', organizationId: ORG, createdAt: ha(290), titulo: 'Objeção: "consórcio é a mesma coisa que financiamento"', categoria: 'Objeções', segmento: 'consorcio', conteudo: 'Não é. No financiamento há juros; no consórcio há taxa de administração...', aprovado: true, usosPelaIa: 942, atualizadoEm: ha(45), autor: 'Carla Mendes' },
  { id: 'kb-003', organizationId: ORG, createdAt: ha(270), titulo: 'Carências padrão por tipo de plano de saúde', categoria: 'Produto', segmento: 'saude', conteudo: 'Urgência e emergência: 24 horas. Consultas e exames simples: 30 dias...', aprovado: true, usosPelaIa: 806, atualizadoEm: ha(20), autor: 'Bianca Rocha' },
  { id: 'kb-004', organizationId: ORG, createdAt: ha(250), titulo: 'Como explicar franquia sem assustar o cliente', categoria: 'Objeções', segmento: 'seguro', conteudo: 'A franquia é a participação do segurado no conserto...', aprovado: true, usosPelaIa: 618, atualizadoEm: ha(60), autor: 'Pedro Almeida' },
  { id: 'kb-005', organizationId: ORG, createdAt: ha(200), titulo: 'Documentos exigidos por administradora', categoria: 'Procedimentos', segmento: 'consorcio', conteudo: 'Rodobens: RG, CPF, comprovante de renda e residência...', aprovado: true, usosPelaIa: 512, atualizadoEm: ha(15), autor: 'Júlia Campos' },
  { id: 'kb-006', organizationId: ORG, createdAt: ha(120), titulo: 'Roteiro de retenção para pedido de cancelamento', categoria: 'Scripts', conteudo: 'Primeiro entenda o motivo real antes de oferecer desconto...', aprovado: true, usosPelaIa: 188, atualizadoEm: ha(10), autor: 'Sofia Lemos' },
  { id: 'kb-007', organizationId: ORG, createdAt: ha(40), titulo: 'Reajuste anual de plano por faixa etária', categoria: 'Produto', segmento: 'saude', conteudo: 'Rascunho — aguardando revisão jurídica.', aprovado: false, usosPelaIa: 0, atualizadoEm: ha(4), autor: 'Bianca Rocha' },
];

/* ---------- Inteligência ---------- */

export const INSIGHTS: Insight[] = [
  { id: 'ins-001', organizationId: ORG, severidade: 'oportunidade', titulo: '8 leads quentes aguardando primeiro atendimento', detalhe: 'Todos com score acima de 80 e entrada nas últimas 6 horas. A conversão cai 21% a cada hora sem contato.', metrica: '8 leads · R$ 1,4 mi em potencial', acao: { rotulo: 'Ver leads', rota: '/app/leads?temperatura=fervendo' }, geradoEm: ha(0, 0.2) },
  { id: 'ins-002', organizationId: ORG, severidade: 'risco', titulo: '23 propostas sem movimentação há mais de 48 horas', detalhe: 'Propostas paradas na etapa de documentação. Historicamente 62% delas esfriam se não houver contato até o quinto dia.', metrica: 'R$ 890 mil parados', acao: { rotulo: 'Abrir propostas', rota: '/app/propostas' }, geradoEm: ha(0, 1) },
  { id: 'ins-003', organizationId: ORG, severidade: 'conquista', titulo: 'Conversão de consórcio subiu 12% nesta semana', detalhe: 'A alta se concentra nos leads que passaram pela triagem da IA antes da distribuição — eles chegam ao vendedor com produto e valor já identificados.', metrica: '18,4% → 20,6%', geradoEm: ha(0, 3) },
  { id: 'ins-004', organizationId: ORG, severidade: 'atencao', titulo: '14 contratos renovam nos próximos 30 dias', detalhe: 'R$ 62 mil em prêmio anual. Nove ainda não têm tarefa de renovação aberta.', metrica: '14 contratos · R$ 62 mil', acao: { rotulo: 'Ver renovações', rota: '/app/contratos' }, geradoEm: ha(0, 5) },
  { id: 'ins-005', organizationId: ORG, severidade: 'risco', titulo: 'SLA violado em 2 chamados de prioridade alta', detalhe: 'Os dois são do mesmo cliente (Eduardo Vieira), que também deu CSAT 2 na última avaliação. É um padrão de churn.', metrica: '2 chamados · CSAT 2,0', acao: { rotulo: 'Ver chamados', rota: '/app/suporte' }, geradoEm: ha(0, 6) },
  { id: 'ins-006', organizationId: ORG, severidade: 'oportunidade', titulo: 'Clientes contemplados são 3,2× mais propensos a indicar', detalhe: 'Dos 31 contemplados nos últimos 12 meses, 12 geraram ao menos uma indicação. A campanha "Indique e ganhe" ainda está em rascunho.', metrica: '312 clientes elegíveis', acao: { rotulo: 'Abrir campanha', rota: '/app/campanhas' }, geradoEm: ha(0, 8) },
];

export const PREVISOES: LeadPrediction[] = [
  { leadId: 'lead-019', probabilidadeFechamento: 0.87, receitaEsperada: 208800, melhorHorarioContato: 'Hoje, entre 14h e 16h', recomendacao: 'Ligar hoje. O lead abriu a cotação três vezes nas últimas 6 horas e a opção mais vista foi a de 80 meses.', fatores: [{ fator: 'Abriu a cotação 3× em 6h', peso: 0.28, contribuicao: 0.24 }, { fator: 'Valor acima da média do segmento', peso: 0.2, contribuicao: 0.17 }, { fator: 'Origem: indicação de cliente contemplado', peso: 0.22, contribuicao: 0.19 }, { fator: 'Respondeu em menos de 5 min nas 4 últimas mensagens', peso: 0.18, contribuicao: 0.15 }, { fator: 'Sem objeção de preço registrada', peso: 0.12, contribuicao: 0.12 }] },
  { leadId: 'lead-035', probabilidadeFechamento: 0.74, receitaEsperada: 222000, melhorHorarioContato: 'Amanhã, entre 9h e 11h', recomendacao: 'Enviar comparativo com lance embutido. O histórico mostra que esse argumento fecha 41% dos leads nesta faixa de valor.', fatores: [{ fator: 'Em negociação há 18 dias', peso: 0.24, contribuicao: -0.08 }, { fator: 'Carta acima de R$ 250 mil', peso: 0.26, contribuicao: 0.22 }, { fator: 'Duas cotações revisadas', peso: 0.2, contribuicao: 0.18 }, { fator: 'Score de crédito aprovado', peso: 0.3, contribuicao: 0.28 }] },
  { leadId: 'lead-021', probabilidadeFechamento: 0.31, receitaEsperada: 6240, melhorHorarioContato: 'Sexta-feira, após 18h', recomendacao: 'Baixa prioridade. O lead pediu para retomar na sexta e não abriu a cotação enviada há 4 dias.', fatores: [{ fator: 'Cotação não visualizada em 4 dias', peso: 0.3, contribuicao: -0.22 }, { fator: 'Pediu adiamento explícito', peso: 0.25, contribuicao: -0.18 }, { fator: 'Produto de ticket baixo', peso: 0.15, contribuicao: -0.06 }, { fator: 'Origem: Google Ads (converte 8%)', peso: 0.2, contribuicao: -0.05 }] },
];

/* ---------- Auditoria ---------- */

export const AUDITORIA: AuditLog[] = [
  { id: 'log-001', organizationId: ORG, usuario: 'Rafael Yuri', papel: 'administrador', acao: 'Alterou regra de comissão', entidade: 'CommissionRule', entidadeId: 'reg-cons', antes: { valor: 3.5 }, depois: { valor: 3.8 }, ip: '189.44.201.18', userAgent: 'Chrome 141 · macOS', em: ha(0, 2) },
  { id: 'log-002', organizationId: ORG, usuario: 'Carla Mendes', papel: 'gestor', acao: 'Aprovou comissão', entidade: 'Commission', entidadeId: 'com-003', antes: { status: 'pendente' }, depois: { status: 'aprovada' }, ip: '201.17.88.204', userAgent: 'Chrome 141 · Windows', em: ha(0, 4) },
  { id: 'log-003', organizationId: ORG, usuario: 'Júlia Campos', papel: 'vendedor', acao: 'Transferiu lead', entidade: 'Lead', entidadeId: 'lead-017', antes: { responsavelId: 'u-julia' }, depois: { responsavelId: 'u-pedro' }, ip: '177.92.14.66', userAgent: 'Safari 19 · iOS', em: ha(0, 6) },
  { id: 'log-004', organizationId: ORG, usuario: 'VEYRA AI', papel: 'administrador', acao: 'Inseriu contato na blacklist', entidade: 'BlacklistEntry', entidadeId: 'bl-001', antes: {}, depois: { contato: '5511977884412', canal: 'todos' }, ip: 'interno', em: ha(12) },
  { id: 'log-005', organizationId: ORG, usuario: 'Tiago Ferraz', papel: 'financeiro', acao: 'Baixou fatura manualmente', entidade: 'Invoice', entidadeId: 'fat-009', antes: { status: 'vencido' }, depois: { status: 'pago', pagoEm: ha(31) }, ip: '189.44.201.20', userAgent: 'Chrome 141 · Windows', em: ha(31) },
  { id: 'log-006', organizationId: ORG, usuario: 'Rafael Yuri', papel: 'administrador', acao: 'Revogou permissão de usuário', entidade: 'User', entidadeId: 'u-lucas', antes: { permissoesRevogadas: [] }, depois: { permissoesRevogadas: ['leads.exportar'] }, ip: '189.44.201.18', userAgent: 'Chrome 141 · macOS', em: ha(3) },
  { id: 'log-007', organizationId: ORG, usuario: 'Renata Dias', papel: 'auditor', acao: 'Exportou trilha de auditoria', entidade: 'AuditLog', ip: '200.181.9.42', userAgent: 'Firefox 148 · Linux', em: ha(6) },
  { id: 'log-008', organizationId: ORG, usuario: 'Marcos Ribeiro', papel: 'supervisor', acao: 'Alterou etapa do pipeline', entidade: 'Pipeline', entidadeId: 'pipe-seguro', antes: { etapas: 5 }, depois: { etapas: 6 }, ip: '177.92.14.70', userAgent: 'Chrome 141 · Windows', em: ha(9) },
];

/* ---------- Linha do tempo do cliente 360° ---------- */

export const LINHA_DO_TEMPO: TimelineEvent[] = [
  { id: 'tl-01', organizationId: ORG, clienteId: 'cli-001', canal: 'whatsapp', titulo: 'Cliente perguntou sobre a assembleia', descricao: 'Júlia respondeu e ficou de confirmar a data.', autor: 'Júlia Campos', em: ha(0, 3) },
  { id: 'tl-02', organizationId: ORG, clienteId: 'cli-001', canal: 'chamado', titulo: 'Chamado VEY-2026-000182 encerrado', descricao: 'Prazo para uso da carta contemplada. CSAT 5.', autor: 'Sofia Lemos', em: ha(0, 20) },
  { id: 'tl-03', organizationId: ORG, clienteId: 'cli-001', canal: 'proposta', titulo: 'Proposta PRP-2026-0349 enviada', descricao: 'Segunda carta — R$ 240.000 em 80 meses.', autor: 'Júlia Campos', em: ha(5) },
  { id: 'tl-04', organizationId: ORG, clienteId: 'cli-001', canal: 'cotacao', titulo: 'Cotação COT-2026-0912 visualizada 3×', descricao: 'A opção mais vista foi a de 80 meses com lance embutido.', autor: 'Sistema', em: ha(6) },
  { id: 'tl-05', organizationId: ORG, clienteId: 'cli-001', canal: 'pagamento', titulo: 'Fatura FT-2026-1841 venceu', descricao: 'Parcela 11/80 — R$ 1.842,40. Régua de cobrança acionada.', autor: 'Sistema', em: ha(2) },
  { id: 'tl-06', organizationId: ORG, clienteId: 'cli-001', canal: 'sistema', titulo: 'Cota contemplada por lance', descricao: 'Grupo 4172, cota 318. Lance embutido de 20%.', autor: 'Sistema', em: ha(96) },
  { id: 'tl-07', organizationId: ORG, clienteId: 'cli-001', canal: 'ligacao', titulo: 'Ligação de 8 min registrada', descricao: 'Cliente pediu simulação de segunda cota para o filho.', autor: 'Júlia Campos', em: ha(30) },
  { id: 'tl-08', organizationId: ORG, clienteId: 'cli-001', canal: 'sistema', titulo: 'Contrato CTR-2025-0418 assinado', descricao: 'Consórcio Automóvel — carta de R$ 128.000.', autor: 'Júlia Campos', em: ha(330) },
];

/* ---------- Notificações ---------- */

export const NOTIFICACOES: Notification[] = [
  { id: 'nt-001', organizationId: ORG, categoria: 'sla' as const, titulo: 'SLA estourado no protocolo VEY-2026-000184', detalhe: 'Prioridade alta, 6h em aberto.', em: ha(0, 0.3), lida: false, rota: '/app/suporte' },
  { id: 'nt-002', organizationId: ORG, categoria: 'leads' as const, titulo: '3 leads quentes sem atendimento', detalhe: 'Entraram nas últimas duas horas.', em: ha(0, 0.6), lida: false, rota: '/app/leads' },
  { id: 'nt-003', organizationId: ORG, categoria: 'financeiro' as const, titulo: 'R$ 2.402,40 vencidos', detalhe: '3 faturas em atraso.', em: ha(0, 2), lida: false, rota: '/app/financeiro' },
  { id: 'nt-004', organizationId: ORG, categoria: 'comissao' as const, titulo: 'Comissão de agosto aguardando aprovação', detalhe: 'R$ 37.028,80 em 3 lançamentos.', em: ha(0, 5), lida: true, rota: '/app/comissoes' },
  { id: 'nt-005', organizationId: ORG, categoria: 'ia' as const, titulo: 'VEYRA AI qualificou 42 leads hoje', detalhe: '38 resolvidos pela base interna, 4 com provedor externo.', em: ha(0, 7), lida: true, rota: '/app/intelligence' },
  { id: 'nt-006', organizationId: ORG, categoria: 'sistema' as const, titulo: 'Google Ads desconectou', detalhe: 'Token expirado há 2 dias.', em: ha(2), lida: true, rota: '/app/integracoes' },
];

/* ---------- Séries do dashboard ----------
   Doze semanas de histórico. Os totais batem com o que as listas acima
   mostram no recorte do mês corrente. */

export const SERIE_MESES = ['Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'];

export const SERIE_LEADS = [820, 906, 1012, 884, 1104, 1188, 1264, 1342, 1418, 1502, 1688, 1842];
export const SERIE_VENDAS = [38, 44, 51, 42, 56, 61, 66, 71, 78, 82, 94, 106];
export const SERIE_RECEITA = [148000, 162000, 181000, 154000, 196000, 214000, 218400, 246200, 271800, 259300, 302700, 328900];
export const SERIE_CONVERSAO = [4.6, 4.9, 5.0, 4.8, 5.1, 5.1, 5.2, 5.3, 5.5, 5.5, 5.6, 5.8];

export const SERIE_IA_INTERNA = [42, 48, 54, 58, 63, 66, 70, 73, 76, 79, 81, 84];

export const ORIGEM_LEADS = [
  { rotulo: 'WhatsApp', valor: 642 },
  { rotulo: 'Meta Ads', valor: 488 },
  { rotulo: 'Indicação', valor: 302 },
  { rotulo: 'Google Ads', valor: 224 },
  { rotulo: 'Afiliados', valor: 118 },
  { rotulo: 'Site', valor: 68 },
];

export const DESEMPENHO_EQUIPE = [
  { nome: 'Júlia Campos', leads: 412, vendas: 38, receita: 148200, conversao: 9.2, tempoResposta: '4 min' },
  { nome: 'Pedro Almeida', leads: 386, vendas: 31, receita: 96400, conversao: 8.0, tempoResposta: '7 min' },
  { nome: 'Bianca Rocha', leads: 298, vendas: 24, receita: 84300, conversao: 8.1, tempoResposta: '11 min' },
  { nome: 'Marcos Ribeiro', leads: 142, vendas: 13, receita: 41800, conversao: 9.2, tempoResposta: '6 min' },
];
