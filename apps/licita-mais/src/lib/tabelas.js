/* =========================================================
   LICITA+ — Tabelas de domínio
   ---------------------------------------------------------
   Códigos que o PNCP usa e a tela precisa exibir por extenso.
   Ficam num lugar só para que a lista do filtro e o rótulo do
   cartão nunca discordem — foi assim que o repositório já
   resolveu isso do lado da API, em `pncp-tabelas.ts`.
   ========================================================= */

/** Códigos de modalidade da Lei 14.133/2021, como no PNCP. */
export const MODALIDADES_PNCP = [
  { codigo: 6, nome: 'Pregão Eletrônico', entrada: true },
  { codigo: 8, nome: 'Dispensa Eletrônica', entrada: true },
  { codigo: 12, nome: 'Credenciamento', entrada: true },
  { codigo: 4, nome: 'Concorrência Eletrônica', entrada: false },
  { codigo: 9, nome: 'Inexigibilidade', entrada: false },
  { codigo: 11, nome: 'Pré-qualificação', entrada: false },
  { codigo: 2, nome: 'Diálogo Competitivo', entrada: false },
  { codigo: 3, nome: 'Concurso', entrada: false },
  { codigo: 1, nome: 'Leilão Eletrônico', entrada: false },
  { codigo: 5, nome: 'Concorrência Presencial', entrada: false },
  { codigo: 7, nome: 'Pregão Presencial', entrada: false },
  { codigo: 10, nome: 'Manifestação de Interesse', entrada: false },
  { codigo: 13, nome: 'Leilão Presencial', entrada: false },
];

const POR_CODIGO_MODALIDADE = new Map(MODALIDADES_PNCP.map((m) => [m.codigo, m.nome]));

/**
 * Código desconhecido não é erro: o PNCP ganha modalidade nova
 * de tempos em tempos, e sumir com a licitação por causa do
 * rótulo seria pior do que mostrar o número.
 */
export const nomeModalidade = (codigo) =>
  POR_CODIGO_MODALIDADE.get(codigo) ?? `Modalidade ${codigo}`;

export const NOME_ESFERA = { F: 'Federal', E: 'Estadual', M: 'Municipal', D: 'Distrital' };

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/** Ordenações que a API aceita, com o rótulo que a tela mostra. */
export const ORDENS_LISTA = [
  { valor: 'compatibilidade', rotulo: 'Maior compatibilidade' },
  { valor: 'prazo', rotulo: 'Encerra primeiro' },
  { valor: 'valor-desc', rotulo: 'Maior valor' },
  { valor: 'valor-asc', rotulo: 'Menor valor' },
  { valor: 'recente', rotulo: 'Publicadas recentemente' },
];
