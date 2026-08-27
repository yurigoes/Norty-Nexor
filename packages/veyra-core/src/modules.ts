/**
 * VEYRA — Catálogo de módulos
 *
 * A navegação, o seletor de módulos do plano no VEYRA Admin e a tela de
 * permissões leem daqui. Um módulo novo entra em um lugar só.
 */

import type { ModuleKey, PhaseKey } from './domain.js';

export interface ModuleDefinition {
  chave: ModuleKey;
  nome: string;
  /** Nome do produto dentro do ecossistema, quando existe. */
  familia?: 'Intelligence' | 'CRM' | 'Connect' | 'Finance' | 'Partners' | 'Support' | 'Campaigns';
  rota: string;
  icone: string;
  grupo: 'operacao' | 'comercial' | 'crescimento' | 'financeiro' | 'pos_venda' | 'plataforma';
  fase: PhaseKey;
  resumo: string;
  /** Módulo que só existe em plano superior ou como add-on. */
  premium?: boolean;
}

export const MODULOS: ModuleDefinition[] = [
  {
    chave: 'dashboard',
    nome: 'Dashboard',
    rota: '/app',
    icone: 'layout-dashboard',
    grupo: 'operacao',
    fase: 'core',
    resumo: 'A operação do dia em uma tela: o que entrou, o que trava e o que fecha.',
  },
  {
    chave: 'intelligence',
    nome: 'Intelligence',
    familia: 'Intelligence',
    rota: '/app/intelligence',
    icone: 'sparkles',
    grupo: 'operacao',
    fase: 'intelligence',
    resumo: 'Score, previsão de fechamento e a próxima ação recomendada por lead.',
    premium: true,
  },
  {
    chave: 'leads',
    nome: 'Leads',
    familia: 'CRM',
    rota: '/app/leads',
    icone: 'user-plus',
    grupo: 'comercial',
    fase: 'core',
    resumo: 'Captura, qualificação, dono e histórico de cada oportunidade.',
  },
  {
    chave: 'funil',
    nome: 'Funil',
    familia: 'CRM',
    rota: '/app/funil',
    icone: 'columns-3',
    grupo: 'comercial',
    fase: 'core',
    resumo: 'Kanban por segmento, com etapas próprias para consórcio, seguro e saúde.',
  },
  {
    chave: 'clientes',
    nome: 'Clientes',
    familia: 'CRM',
    rota: '/app/clientes',
    icone: 'users',
    grupo: 'comercial',
    fase: 'core',
    resumo: 'Cliente 360°: contratos, financeiro, conversas e chamados no mesmo lugar.',
  },
  {
    chave: 'conversas',
    nome: 'Conversas',
    familia: 'Connect',
    rota: '/app/conversas',
    icone: 'messages-square',
    grupo: 'operacao',
    fase: 'core',
    resumo: 'WhatsApp, e-mail e Instagram dentro da plataforma, com a IA no primeiro turno.',
  },
  {
    chave: 'email',
    nome: 'E-mail',
    familia: 'Connect',
    rota: '/app/conversas?canal=email',
    icone: 'mail',
    grupo: 'operacao',
    fase: 'ecossistema',
    resumo: 'Caixa compartilhada por equipe, vinculada ao lead e ao protocolo.',
  },
  {
    chave: 'cotacoes',
    nome: 'Cotações',
    rota: '/app/cotacoes',
    icone: 'calculator',
    grupo: 'comercial',
    fase: 'comercial',
    resumo: 'Comparação de opções, versões, link rastreável e conversão em proposta.',
  },
  {
    chave: 'propostas',
    nome: 'Propostas',
    rota: '/app/propostas',
    icone: 'file-text',
    grupo: 'comercial',
    fase: 'comercial',
    resumo: 'Checklist de documentação, aprovação e virada para contrato.',
  },
  {
    chave: 'contratos',
    nome: 'Contratos',
    rota: '/app/contratos',
    icone: 'file-signature',
    grupo: 'pos_venda',
    fase: 'operacao',
    resumo: 'Vigência, renovação, cota, apólice e mensalidade — cada segmento com seus campos.',
  },
  {
    chave: 'produtos',
    nome: 'Produtos',
    rota: '/app/produtos',
    icone: 'package',
    grupo: 'comercial',
    fase: 'comercial',
    resumo: 'Catálogo por segmento com fornecedor, regra de comissão e argumentos de venda.',
  },
  {
    chave: 'campanhas',
    nome: 'Campanhas',
    familia: 'Campaigns',
    rota: '/app/campanhas',
    icone: 'megaphone',
    grupo: 'crescimento',
    fase: 'comercial',
    resumo: 'Segmentação, disparo, métrica e ROI — sempre respeitando a blacklist.',
  },
  {
    chave: 'automacoes',
    nome: 'Automações',
    rota: '/app/automacoes',
    icone: 'workflow',
    grupo: 'crescimento',
    fase: 'intelligence',
    resumo: 'Construtor visual: quando acontecer X, se Y, então Z.',
  },
  {
    chave: 'tarefas',
    nome: 'Tarefas',
    rota: '/app/tarefas',
    icone: 'check-square',
    grupo: 'operacao',
    fase: 'core',
    resumo: 'Follow-up com dono e prazo. O que não tem próxima ação não existe.',
  },
  {
    chave: 'agenda',
    nome: 'Agenda',
    rota: '/app/agenda',
    icone: 'calendar',
    grupo: 'operacao',
    fase: 'operacao',
    resumo: 'Compromissos, recorrências e lembretes ligados ao cliente.',
  },
  {
    chave: 'financeiro',
    nome: 'Financeiro',
    familia: 'Finance',
    rota: '/app/financeiro',
    icone: 'wallet',
    grupo: 'financeiro',
    fase: 'financeiro',
    resumo: 'Contas a receber e a pagar, boletos, PIX, baixa automática e fluxo de caixa.',
  },
  {
    chave: 'comissoes',
    nome: 'Comissões',
    familia: 'Finance',
    rota: '/app/comissoes',
    icone: 'percent',
    grupo: 'financeiro',
    fase: 'comercial',
    resumo: 'Motor de regras por produto, vendedor e afiliado, com recorrência e estorno.',
  },
  {
    chave: 'partners',
    nome: 'Partners',
    familia: 'Partners',
    rota: '/app/partners',
    icone: 'handshake',
    grupo: 'crescimento',
    fase: 'comercial',
    resumo: 'Afiliados e revendedores com link próprio, extrato e portal externo.',
  },
  {
    chave: 'suporte',
    nome: 'Suporte',
    familia: 'Support',
    rota: '/app/suporte',
    icone: 'life-buoy',
    grupo: 'pos_venda',
    fase: 'operacao',
    resumo: 'Protocolo, SLA por prioridade e CSAT ao encerrar o atendimento.',
  },
  {
    chave: 'conhecimento',
    nome: 'Conhecimento',
    rota: '/app/conhecimento',
    icone: 'book-open',
    grupo: 'pos_venda',
    fase: 'operacao',
    resumo: 'Base que a equipe consulta e que a IA lê antes de responder.',
  },
  {
    chave: 'relatorios',
    nome: 'Relatórios',
    rota: '/app/relatorios',
    icone: 'bar-chart-3',
    grupo: 'plataforma',
    fase: 'intelligence',
    resumo: 'Comercial, marketing, equipe, financeiro, suporte e produto.',
  },
  {
    chave: 'integracoes',
    nome: 'Integrações',
    rota: '/app/integracoes',
    icone: 'plug',
    grupo: 'plataforma',
    fase: 'ecossistema',
    resumo: 'WhatsApp, mídia paga, gateways, APIs de fornecedor e webhooks.',
  },
  {
    chave: 'configuracoes',
    nome: 'Configurações',
    rota: '/app/configuracoes',
    icone: 'settings',
    grupo: 'plataforma',
    fase: 'core',
    resumo: 'Equipes, papéis, permissões, pipelines, SLA e consentimento.',
  },
  {
    chave: 'auditoria',
    nome: 'Auditoria',
    rota: '/app/auditoria',
    icone: 'scroll-text',
    grupo: 'plataforma',
    fase: 'ecossistema',
    resumo: 'Quem alterou o quê, quando, de onde — com antes e depois.',
  },
];

export const MODULO_POR_CHAVE: Record<ModuleKey, ModuleDefinition> = Object.fromEntries(
  MODULOS.map((m) => [m.chave, m]),
) as Record<ModuleKey, ModuleDefinition>;

export const GRUPO_LABELS: Record<ModuleDefinition['grupo'], string> = {
  operacao: 'Operação',
  comercial: 'Comercial',
  crescimento: 'Crescimento',
  financeiro: 'Financeiro',
  pos_venda: 'Pós-venda',
  plataforma: 'Plataforma',
};
