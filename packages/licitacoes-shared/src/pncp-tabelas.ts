/* =========================================================
   Nexor Licitações — Tabelas de domínio do PNCP
   ---------------------------------------------------------
   O PNCP devolve códigos numéricos, não rótulos estáveis. Estas
   tabelas traduzem código → significado e, mais importante,
   código → *como aquilo se comporta na prática*: se é eletrônico
   ou exige presença física, se aceita disputa de lances, se é
   caminho realista para uma empresa pequena começar.

   É esse "comportamento" que a triagem usa para pontuar. Sem
   isso o radar trataria um leilão presencial em outro estado
   igual a uma dispensa eletrônica no município ao lado.

   Referência: tabelas de domínio do Manual de Integração do PNCP
   (Lei 14.133/2021). Códigos novos podem aparecer — por isso
   todo acesso passa por `modalidade()`, que degrada com
   elegância em vez de quebrar.
   ========================================================= */

export interface Modalidade {
  codigo: number;
  nome: string;
  /** Presencial exige deslocamento e representante no local. */
  eletronica: boolean;
  /**
   * Quão acessível é para quem está começando: 'entrada' são os
   * ritos curtos e de baixo valor, 'intermediaria' pede estrutura
   * documental, 'avancada' raramente vale a pena sem experiência.
   */
  acessibilidade: 'entrada' | 'intermediaria' | 'avancada';
}

const MODALIDADES: readonly Modalidade[] = [
  { codigo: 1, nome: 'Leilão — Eletrônico', eletronica: true, acessibilidade: 'avancada' },
  { codigo: 2, nome: 'Diálogo Competitivo', eletronica: true, acessibilidade: 'avancada' },
  { codigo: 3, nome: 'Concurso', eletronica: true, acessibilidade: 'avancada' },
  { codigo: 4, nome: 'Concorrência — Eletrônica', eletronica: true, acessibilidade: 'intermediaria' },
  { codigo: 5, nome: 'Concorrência — Presencial', eletronica: false, acessibilidade: 'avancada' },
  { codigo: 6, nome: 'Pregão — Eletrônico', eletronica: true, acessibilidade: 'entrada' },
  { codigo: 7, nome: 'Pregão — Presencial', eletronica: false, acessibilidade: 'avancada' },
  { codigo: 8, nome: 'Dispensa de Licitação', eletronica: true, acessibilidade: 'entrada' },
  { codigo: 9, nome: 'Inexigibilidade', eletronica: true, acessibilidade: 'avancada' },
  { codigo: 10, nome: 'Manifestação de Interesse', eletronica: true, acessibilidade: 'avancada' },
  { codigo: 11, nome: 'Pré-qualificação', eletronica: true, acessibilidade: 'intermediaria' },
  { codigo: 12, nome: 'Credenciamento', eletronica: true, acessibilidade: 'entrada' },
  { codigo: 13, nome: 'Leilão — Presencial', eletronica: false, acessibilidade: 'avancada' },
];

const POR_CODIGO = new Map(MODALIDADES.map((m) => [m.codigo, m]));

/**
 * Traduz o código de modalidade. Um código desconhecido não é erro:
 * o PNCP pode ganhar modalidades novas, e derrubar o radar diário
 * por causa disso seria pior do que tratá-la como avançada até
 * alguém classificar.
 */
export function modalidade(codigo: number): Modalidade {
  return (
    POR_CODIGO.get(codigo) ?? {
      codigo,
      nome: `Modalidade ${codigo}`,
      eletronica: true,
      acessibilidade: 'avancada',
    }
  );
}

export function modalidadesDeEntrada(): Modalidade[] {
  return MODALIDADES.filter((m) => m.acessibilidade === 'entrada');
}

export function todasModalidades(): readonly Modalidade[] {
  return MODALIDADES;
}

/* ---------- Situação da contratação ---------- */

/**
 * Só `1 — Divulgada no PNCP` está de pé. Revogada, anulada e
 * suspensa continuam aparecendo nas consultas por período, então
 * o filtro é responsabilidade de quem consome.
 */
export const SITUACAO_DIVULGADA = 1;

const SITUACOES: Record<number, string> = {
  1: 'Divulgada no PNCP',
  2: 'Revogada',
  3: 'Anulada',
  4: 'Suspensa',
};

export function situacao(codigo: number): string {
  return SITUACOES[codigo] ?? `Situação ${codigo}`;
}

/* ---------- Modo de disputa ---------- */

const MODOS_DISPUTA: Record<number, string> = {
  1: 'Aberto',
  2: 'Fechado',
  3: 'Aberto-Fechado',
  4: 'Dispensa com disputa',
  5: 'Não se aplica',
  6: 'Fechado-Aberto',
};

export function modoDisputa(codigo: number): string {
  return MODOS_DISPUTA[codigo] ?? `Modo ${codigo}`;
}

/**
 * No modo aberto os lances acontecem ao vivo, com prorrogação
 * automática a cada lance no fim do período. Quem participa
 * precisa estar na tela na hora — o radar avisa com antecedência
 * justamente porque essa janela não se recupera.
 */
export function exigePresencaNaDisputa(codigo: number): boolean {
  return codigo === 1 || codigo === 3 || codigo === 6;
}

/* ---------- Esfera de governo ---------- */

const ESFERAS: Record<string, string> = {
  F: 'Federal',
  E: 'Estadual',
  M: 'Municipal',
  D: 'Distrital',
};

export function esfera(sigla: string): string {
  return ESFERAS[sigla?.toUpperCase()] ?? sigla ?? '—';
}

/* ---------- Limites legais ---------- */

/**
 * LC 123/2006, art. 48, I: contratação de até R$ 80.000 é
 * exclusiva de microempresa e empresa de pequeno porte. É o
 * teto mais estável da legislação — os limites de dispensa da
 * Lei 14.133 são corrigidos por decreto todo ano, este não.
 *
 * A exclusividade vale por *item*, e o PNCP só expõe o valor
 * total da contratação na consulta por período. Por isso o
 * radar trata isso como indício forte, nunca como certeza: a
 * confirmação está no edital.
 */
export const TETO_EXCLUSIVIDADE_ME_EPP = 80_000;
