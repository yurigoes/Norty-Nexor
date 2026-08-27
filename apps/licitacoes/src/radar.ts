/* =========================================================
   Nexor Licitações — Radar
   ---------------------------------------------------------
   Orquestra a varredura: consulta o PNCP, normaliza, tria com o
   perfil e ordena por prioridade.

   A janela padrão olha para frente, não para trás. O que
   interessa não é o que foi publicado ontem, e sim o que ainda
   aceita proposta — uma contratação publicada há duas semanas
   com prazo aberto até sexta vale muito mais que uma publicada
   hoje e encerrada amanhã.
   ========================================================= */

import {
  type Descarte,
  type OportunidadeTriada,
  type PerfilEmpresa,
  type ResultadoRadar,
  ordenarPorPrioridade,
  paraFormatoPncp,
  somarDias,
  triar,
  ClientePncp,
  normalizarLote,
  type OpcoesCliente,
} from '@nexor/licitacoes-shared';


export interface OpcoesRadar {
  /** Quantos dias à frente procurar prazos que ainda fecham. */
  janelaDias?: number;
  /** Instante de referência. Injetável para tornar o teste determinístico. */
  agora?: Date;
  cliente?: ClientePncp;
  opcoesCliente?: OpcoesCliente;
}

export interface RelatorioRadar extends ResultadoRadar {
  /** Modalidades que não puderam ser consultadas, se houve alguma. */
  falhas: { modalidade: number; erro: string }[];
}

export async function executarRadar(
  perfil: PerfilEmpresa,
  opcoes: OpcoesRadar = {},
): Promise<RelatorioRadar> {
  const agora = opcoes.agora ?? new Date();
  const janelaDias = opcoes.janelaDias ?? 30;
  const cliente = opcoes.cliente ?? new ClientePncp(opcoes.opcoesCliente);

  const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
    dataFinal: paraFormatoPncp(somarDias(agora, janelaDias)),
    modalidades: perfil.modalidades,
    uf: perfil.uf,
  });

  const oportunidades = normalizarLote(contratacoes);

  const aprovadas: OportunidadeTriada[] = [];
  const descartadas: Descarte[] = [];

  for (const oportunidade of oportunidades) {
    const { aprovada, descarte } = triar(oportunidade, perfil, agora);
    if (aprovada) aprovadas.push(aprovada);
    if (descarte) descartadas.push(descarte);
  }

  return {
    geradoEm: agora.toISOString(),
    perfil: perfil.razaoSocial,
    totalConsultado: contratacoes.length,
    aprovadas: ordenarPorPrioridade(aprovadas),
    descartadas,
    falhas,
  };
}

/**
 * Agrupa os descartes por motivo. Serve para diagnosticar perfil
 * mal calibrado: se 900 de 1000 saíram por "não bate com nenhuma
 * linha", o problema pode ser falta de palavra-chave, não falta
 * de oportunidade.
 */
export function resumirDescartes(descartadas: Descarte[]): { motivo: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const { motivo } of descartadas) {
    // Agrupa pelo prefixo antes dos dois-pontos para que
    // "Fora do alcance: Campinas/SP" e "Fora do alcance: Santos/SP"
    // caiam no mesmo balde.
    const chave = motivo.split(':')[0].trim();
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([motivo, total]) => ({ motivo, total }))
    .sort((a, b) => b.total - a.total);
}
