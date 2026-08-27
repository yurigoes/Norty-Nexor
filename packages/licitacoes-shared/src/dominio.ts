/* =========================================================
   Nexor Licitações — Modelo de domínio
   ---------------------------------------------------------
   Fonte única de verdade do produto de licitações, separada do
   domínio de condomínio do my Home. O que o PNCP devolve é cru e
   inconsistente entre órgãos; aqui ele já chega normalizado, com
   os campos que a triagem e a tela precisam.

   Nada neste arquivo executa envio de proposta. O sistema acha,
   lê, pontua e avisa — a decisão de ofertar preço é um ato
   jurídico vinculante e continua sendo do fornecedor.
   ========================================================= */

export type ID = string;

/** Porte declarado na Receita. Define acesso à cota exclusiva ME/EPP. */
export type PorteEmpresa = 'mei' | 'me' | 'epp' | 'demais';

/* ---------- Perfil do fornecedor ---------- */

/**
 * Uma linha de fornecimento é "uma coisa que a empresa vende".
 * Separar em linhas (em vez de uma lista solta de palavras)
 * permite dizer *por que* uma oportunidade apareceu — "bateu na
 * linha Informática" é acionável, "bateu em 3 palavras" não é.
 */
export interface LinhaFornecimento {
  nome: string;
  /** Termos que indicam aderência. Frases funcionam: 'material de escritório'. */
  palavrasChave: string[];
  /**
   * Termos que derrubam a oportunidade mesmo com aderência.
   * Ex.: quem revende computador não quer "locação de impressora".
   */
  palavrasExcluidas?: string[];
}

export interface PerfilEmpresa {
  razaoSocial: string;
  cnpj: string;
  porte: PorteEmpresa;
  /** UF de origem, usada como último anel do alcance geográfico. */
  uf: string;
  /** Código IBGE do município sede. */
  municipioIbge: string;
  /**
   * Municípios vizinhos que a empresa atende sem inviabilizar
   * entrega. Este é o anel "região" da pontuação geográfica.
   */
  municipiosRegiao: string[];
  linhas: LinhaFornecimento[];
  /** Abaixo disso o esforço não paga o custo de participar. */
  valorMinimo: number;
  /** Acima disso a empresa não tem fôlego de capital de giro. */
  valorMaximo: number;
  /** Códigos de modalidade que interessam. Vazio = todas. */
  modalidades: number[];
  /** Dias úteis que a empresa precisa para montar proposta e documentos. */
  diasMinimosPreparo: number;
}

/* ---------- Oportunidade normalizada ---------- */

export interface Orgao {
  cnpj: string;
  razaoSocial: string;
  /** F, E, M ou D. */
  esfera: string;
}

export interface UnidadeCompradora {
  nome: string;
  municipio: string;
  municipioIbge: string;
  uf: string;
}

export interface Oportunidade {
  /** Chave natural do PNCP: `<cnpj>-1-<sequencial>/<ano>`. */
  id: ID;
  cnpjOrgao: string;
  ano: number;
  sequencial: number;
  objeto: string;
  informacaoComplementar?: string;
  modalidadeCodigo: number;
  modoDisputaCodigo: number;
  situacaoCodigo: number;
  /** Sistema de Registro de Preços: ata não obriga o órgão a comprar. */
  registroDePrecos: boolean;
  /** Ausente quando o órgão declara o orçamento sigiloso. */
  valorEstimado: number | null;
  aberturaProposta: string | null;
  encerramentoProposta: string | null;
  publicacao: string | null;
  orgao: Orgao;
  unidade: UnidadeCompradora;
  /** Página pública do edital no PNCP. */
  linkPncp: string;
  /**
   * Plataforma onde a proposta é efetivamente enviada — pode ser
   * Compras.gov.br, BEC, Licitações-e ou uma bolsa privada. É o
   * campo que decide em qual sistema o fornecedor precisa ter
   * cadastro, então vale mais que o link do PNCP.
   */
  linkSistemaOrigem: string | null;
}

/* ---------- Resultado da triagem ---------- */

export type PesoMotivo = 'aderencia' | 'geografia' | 'valor' | 'modalidade' | 'exclusividade';

export interface Motivo {
  peso: PesoMotivo;
  pontos: number;
  explicacao: string;
}

export type GravidadeAlerta = 'atencao' | 'critico';

export interface Alerta {
  gravidade: GravidadeAlerta;
  mensagem: string;
}

/**
 * Uma oportunidade avaliada. `motivos` existe para que a nota
 * nunca seja um número mágico: quem lê a lista precisa conseguir
 * discordar do critério, e para discordar precisa vê-lo.
 */
export interface OportunidadeTriada {
  oportunidade: Oportunidade;
  /** 0 a 100. */
  nota: number;
  motivos: Motivo[];
  alertas: Alerta[];
  /** Horas até o fim do prazo de propostas; negativo = encerrado. */
  horasRestantes: number | null;
  linhasAtendidas: string[];
}

export interface Descarte {
  oportunidade: Oportunidade;
  motivo: string;
}

export interface ResultadoRadar {
  geradoEm: string;
  perfil: string;
  /** Quantas contratações a consulta trouxe antes de qualquer filtro. */
  totalConsultado: number;
  aprovadas: OportunidadeTriada[];
  descartadas: Descarte[];
}
