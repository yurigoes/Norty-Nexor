/* =========================================================
   LICITA+ API — Forma pública de uma oportunidade
   ---------------------------------------------------------
   Um único lugar converte `Licitacao + Avaliacao` na resposta
   que o aplicativo desenha. Antes de existir, favoritos
   devolvia um recorte próprio, e o cliente precisava saber
   duas formas do mesmo objeto — o tipo de divergência que só
   aparece quando alguém adiciona um campo em uma delas.

   É também a fronteira onde `Decimal` vira `number`, uma vez
   só, como manda a regra de dinheiro do repositório.
   ========================================================= */

export interface AvaliacaoSerializavel {
  nota: number;
  motivos: unknown;
  alertas: unknown;
  linhasAtendidas: string[];
  licitacao: Record<string, unknown>;
}

export function serializarOportunidade(avaliacao: AvaliacaoSerializavel, favorito: boolean) {
  const l = avaliacao.licitacao;

  return {
    id: l.id,
    numeroControlePncp: l.numeroControlePncp,
    objeto: l.objeto,
    informacaoComplementar: l.informacaoComplementar,

    orgao: {
      cnpj: l.cnpjOrgao,
      razaoSocial: l.orgaoRazaoSocial,
      esfera: l.orgaoEsfera,
      unidade: l.unidadeNome,
      municipio: l.municipio,
      uf: l.uf,
    },

    modalidadeCodigo: l.modalidadeCodigo,
    modoDisputaCodigo: l.modoDisputaCodigo,
    registroDePrecos: l.registroDePrecos,
    numeroCompra: l.numeroCompra,
    processo: l.processo,

    valorEstimado: l.valorEstimado === null ? null : Number(l.valorEstimado),
    aberturaProposta: l.aberturaProposta,
    encerramentoProposta: l.encerramentoProposta,
    publicacaoPncp: l.publicacaoPncp,

    linkPncp: l.linkPncp,
    linkSistemaOrigem: l.linkSistemaOrigem,

    compatibilidade: avaliacao.nota,
    motivos: avaliacao.motivos,
    alertas: avaliacao.alertas,
    linhasAtendidas: avaliacao.linhasAtendidas,
    favorito,
  };
}

/**
 * Favorito sem avaliação acontece de verdade: trocar o perfil
 * apaga as notas para forçar recálculo, e até a próxima varredura
 * a licitação favoritada existe sem nota. Devolver nota zero é
 * honesto — o cartão mostra "sem avaliação" em vez de sumir da
 * lista que o usuário montou à mão.
 */
export const semAvaliacao = (licitacao: Record<string, unknown>): AvaliacaoSerializavel => ({
  nota: 0,
  motivos: [],
  alertas: [],
  linhasAtendidas: [],
  licitacao,
});
