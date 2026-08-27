/* =========================================================
   Nexor Licitações — Formato bruto do PNCP
   ---------------------------------------------------------
   O que a API devolve, antes de virar domínio. Tudo aqui é
   opcional de propósito.

   Não é preciosismo: o PNCP agrega publicações de milhares de
   órgãos com sistemas próprios, e campos faltam com frequência —
   `valorTotalEstimado` some quando o orçamento é sigiloso,
   `unidadeOrgao` vem incompleta em publicações antigas,
   `linkSistemaOrigem` simplesmente não é preenchido por parte
   dos municípios. Tipar como obrigatório aqui só transferiria a
   quebra para o meio do relatório.
   ========================================================= */

export interface OrgaoBruto {
  cnpj?: string;
  razaoSocial?: string;
  poderId?: string;
  esferaId?: string;
}

export interface UnidadeBruta {
  nomeUnidade?: string;
  codigoUnidade?: string;
  municipioNome?: string;
  codigoIbge?: string;
  ufSigla?: string;
  ufNome?: string;
}

export interface ContratacaoBruta {
  numeroControlePNCP?: string;
  numeroCompra?: string;
  anoCompra?: number;
  sequencialCompra?: number;
  processo?: string;
  objetoCompra?: string;
  informacaoComplementar?: string | null;
  modalidadeId?: number;
  modalidadeNome?: string;
  modoDisputaId?: number;
  modoDisputaNome?: string;
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  srp?: boolean;
  valorTotalEstimado?: number | null;
  valorTotalHomologado?: number | null;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  dataPublicacaoPncp?: string | null;
  linkSistemaOrigem?: string | null;
  orgaoEntidade?: OrgaoBruto;
  unidadeOrgao?: UnidadeBruta;
}

/**
 * Envelope de paginação do PNCP. `paginasRestantes` é o campo
 * que o cliente usa para saber quando parar — mais confiável do
 * que comparar `numeroPagina` com `totalPaginas`, que vem ausente
 * em algumas respostas.
 */
export interface PaginaBruta<T> {
  data?: T[];
  totalRegistros?: number;
  totalPaginas?: number;
  numeroPagina?: number;
  paginasRestantes?: number;
  empty?: boolean;
}
