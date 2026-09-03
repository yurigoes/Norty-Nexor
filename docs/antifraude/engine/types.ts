// =========================================================
//  Motor de casamento — tipos de domínio
// ---------------------------------------------------------
//  Núcleo puro (sem Prisma, sem NestJS): recebe arrays já
//  filtrados pelos índices do schema.prisma e devolve
//  decisões. O serviço da API é uma casca fina em volta disto
//  — busca no Postgres usando exatamente os índices de
//  `storeId, productId, weightGrams, state`, e persiste o que
//  o motor decidiu.
//
//  Premissa de projeto, confirmada no manual da Toledo Prix
//  5 Plus (docs/antifraude/homologacao-toledo-prix5plus.md):
//  a balança NÃO bloqueia sem identificação — pede o código e
//  um toque de tecla pula o pedido. `operatorId: null` é
//  portanto o caso FREQUENTE, não a exceção. Por isso ele não
//  participa em nenhum momento do casamento: quem pesou nunca
//  aparece no XML da NFC-e, então usar identidade como parte
//  do custo seria comparar dois dados que não existem no
//  mesmo lugar. O casamento é só produto + peso + tempo.
// =========================================================

export type Grams = number;
/** Centavos. Na borda da API isto é Decimal(12,2); aqui, inteiro, pelo mesmo motivo do peso: chave de conta não pode ser float. */
export type Cents = number;

export type AuthMethod = 'rfid' | 'codigo' | 'nenhum';

export type LabelState =
  | 'emitida'
  | 'conciliada'
  | 'cancelada'
  | 'nao_conciliada'
  | 'divergente'
  | 'reimpressa'
  | 'expirada';

export interface DepartmentSettings {
  /** Minutos até a etiqueta vencer a janela e virar candidata a alerta. */
  matchWindowMinutes: number;
  /** Minutos em que o estorno é considerado normal; depois disso, marcado. */
  cancelWindowMinutes: number;
  /** Tolerância de arredondamento do PDV, em gramas. 0 exige peso exato. */
  weightToleranceGrams: number;
  weightCostWeight: number;
  timeCostWeight: number;
  /** Custo máximo para o casamento acontecer sozinho, sem revisão humana. */
  autoMatchMaxCost: number;
}

export interface LabelRecord {
  id: string;
  storeId: string;
  departmentId: string;
  scaleId: string;
  /** null é o caso comum nesta balança — ver nota no topo do arquivo. */
  operatorId: string | null;
  authMethod: AuthMethod;
  productId: string | null;
  /** Código cru mesmo sem produto cadastrado — a conta tem de fechar de qualquer forma. */
  plu: string;
  weightGrams: Grams;
  totalValueCents: Cents;
  barcode: string;
  /** Atalho do Cenário A: presente quando a balança está em C18 Tipo 7. */
  serial: string | null;
  issuedAt: Date;
  matchWindowUntil: Date;
  state: LabelState;
  burned: boolean;
  parentLabelId?: string | null;
}

export interface FiscalItemRecord {
  id: string;
  storeId: string;
  documentId: string;
  productId: string | null;
  plu: string | null;
  /** null para item não pesável — nunca compete pelo casamento. */
  weightGrams: Grams | null;
  totalValueCents: Cents;
  serial: string | null;
  /** issuedAt do documento fiscal ao qual este item pertence. */
  soldAt: Date;
}

export interface MatchCandidateResult {
  fiscalItem: FiscalItemRecord;
  cost: number;
  weightDeltaGrams: number;
  timeDeltaSeconds: number;
  rank: number;
  viaSerial: boolean;
}

export type MatchConfidence = 'alta' | 'media' | 'baixa' | 'manual';

export interface MatchOutcome {
  label: LabelRecord;
  /** Ordenados por custo — o que a fila de revisão mostra ao lado do clipe. */
  candidates: MatchCandidateResult[];
  /** Preenchido só quando o motor confia sozinho (confiança alta ou média). */
  autoMatch: { fiscalItem: FiscalItemRecord; confidence: MatchConfidence; cost: number } | null;
}
