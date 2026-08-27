/* =========================================================
   Nexor Licitações — Bruto do PNCP → domínio
   ---------------------------------------------------------
   Fronteira entre "o que a API mandou" e "o que o sistema
   entende". Depois daqui nenhum módulo precisa saber que
   `srp` quer dizer registro de preços, nem lidar com campo
   ausente.

   Registro sem identificação mínima é ignorado em vez de
   entrar com buracos: uma contratação sem CNPJ e sem
   sequencial não tem link de edital, e um item na lista que
   não leva a lugar nenhum é pior que um item a menos.
   ========================================================= */

import type { Oportunidade } from '@nexor/licitacoes-shared';
import type { ContratacaoBruta } from './tipos.ts';

export function normalizarContratacao(bruta: ContratacaoBruta): Oportunidade | null {
  const cnpj = bruta.orgaoEntidade?.cnpj?.replace(/\D/g, '') ?? '';
  const ano = bruta.anoCompra;
  const sequencial = bruta.sequencialCompra;
  const objeto = bruta.objetoCompra?.trim() ?? '';

  if (cnpj.length === 0 || !ano || !sequencial || objeto.length === 0) return null;

  const id = bruta.numeroControlePNCP ?? `${cnpj}-1-${String(sequencial).padStart(6, '0')}/${ano}`;

  return {
    id,
    cnpjOrgao: cnpj,
    ano,
    sequencial,
    objeto,
    informacaoComplementar: bruta.informacaoComplementar?.trim() || undefined,
    modalidadeCodigo: bruta.modalidadeId ?? 0,
    modoDisputaCodigo: bruta.modoDisputaId ?? 5,
    // Sem situação declarada, assume divulgada: o endpoint de
    // proposta em aberto só lista o que está de pé, e descartar
    // por omissão de campo esconderia oportunidade real.
    situacaoCodigo: bruta.situacaoCompraId ?? 1,
    registroDePrecos: bruta.srp === true,
    valorEstimado: valorOuNulo(bruta.valorTotalEstimado),
    aberturaProposta: bruta.dataAberturaProposta ?? null,
    encerramentoProposta: bruta.dataEncerramentoProposta ?? null,
    publicacao: bruta.dataPublicacaoPncp ?? null,
    orgao: {
      cnpj,
      razaoSocial: bruta.orgaoEntidade?.razaoSocial?.trim() ?? 'Órgão não identificado',
      esfera: bruta.orgaoEntidade?.esferaId ?? '',
    },
    unidade: {
      nome: bruta.unidadeOrgao?.nomeUnidade?.trim() ?? '—',
      municipio: bruta.unidadeOrgao?.municipioNome?.trim() ?? '—',
      municipioIbge: bruta.unidadeOrgao?.codigoIbge?.trim() ?? '',
      uf: bruta.unidadeOrgao?.ufSigla?.trim().toUpperCase() ?? '',
    },
    linkPncp: `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${sequencial}`,
    linkSistemaOrigem: bruta.linkSistemaOrigem?.trim() || null,
  };
}

/**
 * Zero e negativo viram `null`: o PNCP usa 0 tanto para
 * "orçamento sigiloso" quanto para "não informado", e tratar
 * isso como valor real faria a triagem pontuar uma contratação
 * de milhões como se fosse de graça.
 */
function valorOuNulo(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return valor;
}

export function normalizarLote(brutas: ContratacaoBruta[]): Oportunidade[] {
  const oportunidades: Oportunidade[] = [];
  for (const bruta of brutas) {
    const normalizada = normalizarContratacao(bruta);
    if (normalizada) oportunidades.push(normalizada);
  }
  return oportunidades;
}
