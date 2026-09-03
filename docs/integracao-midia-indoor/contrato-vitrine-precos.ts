// =========================================================
//  Contrato de dados — vitrine de preços na mídia indoor
// ---------------------------------------------------------
//  Fronteira entre o coletor (adapter por fabricante de
//  balança — Toledo hoje) e o player de mídia indoor. O
//  player nunca importa nada de um adapter específico: ele
//  só conhece este arquivo. Trocar de fabricante, ou somar um
//  segundo, é escrever um novo `Collector`, não tocar no que
//  vem depois dele.
//
//  Ver docs/integracao-midia-indoor.md para o desenho completo.
// =========================================================

export type Categoria = 'acougue' | 'padaria' | 'peixaria' | 'hortifruti' | 'frios' | 'outro';

export type OrigemPreco = 'toledo_mgv7' | 'toledo_mgv_cloud' | 'manual';

export interface ItemVitrine {
  lojaId: string;
  /** PLU cadastrado na balança — a mesma chave que aparece na etiqueta impressa. */
  sku: string;
  /** Nome curto para tela, não a descrição completa de etiqueta. */
  nome: string;
  categoria: Categoria;
  /**
   * Preço por kg em CENTAVOS, inteiro — nunca float. É o mesmo motivo do
   * peso em gramas no schema do antifraude: o que está na tela, em
   * público, não pode carregar erro de arredondamento.
   */
  precoPorKgCentavos: number;
  unidade: 'kg' | 'un';
  imagemUrl?: string;
  /** ISO 8601. Fim de uma promoção, por exemplo — depois disso, o item some do rodízio. */
  validoAte?: string;
  /** ISO 8601. Quando o coletor viu este valor pela última vez na fonte. */
  atualizadoEm: string;
  origem: OrigemPreco;
}

/** O que o coletor publica de cada vez — sempre a foto inteira da loja, nunca um delta. */
export interface CatalogoVitrine {
  lojaId: string;
  geradoEm: string; // ISO 8601
  itens: ItemVitrine[];
}

// ---------------- validação em runtime ----------------
//
// TypeScript garante o formato em tempo de compilação; isto garante em
// tempo de execução, no momento em que o arquivo do MGV7 vira JSON — é
// a fronteira onde dado externo (arquivo-texto de terceiro) entra no
// seu sistema, e fronteira de sistema é onde se valida (CLAUDE.md do
// projeto irmão tem a mesma regra: erro inesperado não sai cru para o
// próximo componente).

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const CATEGORIAS: readonly Categoria[] = ['acougue', 'padaria', 'peixaria', 'hortifruti', 'frios', 'outro'];
const ORIGENS: readonly OrigemPreco[] = ['toledo_mgv7', 'toledo_mgv_cloud', 'manual'];

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function validateItemVitrine(item: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `itens[${index}]`;

  if (typeof item !== 'object' || item === null) {
    return [`${prefix}: não é um objeto`];
  }
  const it = item as Record<string, unknown>;

  if (typeof it.lojaId !== 'string' || it.lojaId === '') errors.push(`${prefix}.lojaId: obrigatório`);
  if (typeof it.sku !== 'string' || it.sku === '') errors.push(`${prefix}.sku: obrigatório`);
  if (typeof it.nome !== 'string' || it.nome === '') errors.push(`${prefix}.nome: obrigatório`);

  if (typeof it.categoria !== 'string' || !CATEGORIAS.includes(it.categoria as Categoria)) {
    errors.push(`${prefix}.categoria: deve ser uma de ${CATEGORIAS.join(', ')}`);
  }

  if (typeof it.precoPorKgCentavos !== 'number' || !Number.isInteger(it.precoPorKgCentavos)) {
    errors.push(`${prefix}.precoPorKgCentavos: deve ser inteiro (centavos, nunca float)`);
  } else if (it.precoPorKgCentavos <= 0) {
    // Preço zerado ou negativo nunca deve chegar à tela — ver §7 do documento.
    errors.push(`${prefix}.precoPorKgCentavos: deve ser positivo — preço zerado não vai para a vitrine`);
  }

  if (it.unidade !== 'kg' && it.unidade !== 'un') {
    errors.push(`${prefix}.unidade: deve ser 'kg' ou 'un'`);
  }

  if (it.imagemUrl !== undefined && typeof it.imagemUrl !== 'string') {
    errors.push(`${prefix}.imagemUrl: se presente, deve ser string`);
  }

  if (it.validoAte !== undefined && !isIsoDate(it.validoAte)) {
    errors.push(`${prefix}.validoAte: se presente, deve ser data ISO 8601 válida`);
  }

  if (!isIsoDate(it.atualizadoEm)) {
    errors.push(`${prefix}.atualizadoEm: obrigatório, data ISO 8601 válida`);
  }

  if (typeof it.origem !== 'string' || !ORIGENS.includes(it.origem as OrigemPreco)) {
    errors.push(`${prefix}.origem: deve ser uma de ${ORIGENS.join(', ')}`);
  }

  return errors;
}

export function validateCatalogoVitrine(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, errors: ['payload não é um objeto'] };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.lojaId !== 'string' || p.lojaId === '') errors.push('lojaId: obrigatório');
  if (!isIsoDate(p.geradoEm)) errors.push('geradoEm: obrigatório, data ISO 8601 válida');

  if (!Array.isArray(p.itens)) {
    errors.push('itens: deve ser um array');
  } else {
    p.itens.forEach((item, index) => errors.push(...validateItemVitrine(item, index)));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Filtra o que é seguro exibir agora: sem itens vencidos (`validoAte`
 * passado) e sem itens velhos demais (`atualizadoEm` além do limite de
 * idade — ver §7 do documento: melhor sumir do rodízio do que mostrar
 * preço desatualizado).
 */
export function itensSegurosParaExibir(
  catalogo: CatalogoVitrine,
  agora: Date,
  idadeMaximaHoras = 24,
): ItemVitrine[] {
  const limiteIdadeMs = idadeMaximaHoras * 60 * 60 * 1000;

  return catalogo.itens.filter((item) => {
    if (item.validoAte && Date.parse(item.validoAte) < agora.getTime()) return false;

    const idadeMs = agora.getTime() - Date.parse(item.atualizadoEm);
    if (idadeMs > limiteIdadeMs) return false;

    return true;
  });
}
