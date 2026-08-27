/* =========================================================
   Nexor Licitações — Cliente da API de consulta do PNCP
   ---------------------------------------------------------
   API pública, sem autenticação, documentada em
   https://pncp.gov.br/api/consulta/swagger-ui/index.html

   Três decisões que valem explicação:

   1. **Consulta por UF, filtra município no cliente.** O endpoint
      aceita `codigoMunicipioIbge`, mas uma consulta por município
      multiplicaria as chamadas pelo número de cidades da região.
      Uma consulta por UF traz tudo e a triagem recorta depois —
      menos requisições, e ainda habilita o anel "estado".

   2. **Uma chamada por modalidade.** `codigoModalidadeContratacao`
      é obrigatório e único. Não há como pedir dispensa e pregão
      na mesma requisição; o cliente serializa e concatena.

   3. **Falha de uma modalidade não derruba o radar.** Se a
      consulta de pregão cair, a de dispensa ainda vale. Os erros
      voltam junto com os dados, para o relatório dizer o que
      ficou faltando em vez de fingir que a lista está completa.
   ========================================================= */

import type { ContratacaoBruta, PaginaBruta } from './pncp-tipos.ts';

export const BASE_PADRAO = 'https://pncp.gov.br/api/consulta';

/** Teto do `tamanhoPagina` aceito pelo endpoint de contratações. */
const TAMANHO_PAGINA = 50;

/** Trava contra paginação infinita se a API devolver o envelope errado. */
const MAX_PAGINAS = 40;

export interface OpcoesCliente {
  base?: string;
  timeoutMs?: number;
  tentativas?: number;
  /** Injetável para teste; por padrão o `fetch` global do Node. */
  fetchImpl?: typeof fetch;
  /** Pausa entre tentativas. Injetável para não deixar teste lento. */
  aguardar?: (ms: number) => Promise<void>;
}

export interface ConsultaProposta {
  /** Fim da janela de recebimento de propostas, AAAAMMDD. */
  dataFinal: string;
  modalidades: number[];
  uf: string;
}

export interface ResultadoConsulta {
  contratacoes: ContratacaoBruta[];
  /** Modalidades cuja consulta falhou, com o motivo. */
  falhas: { modalidade: number; erro: string }[];
}

/**
 * O campo é declarado e atribuído no corpo, em vez de vir como
 * "parameter property" do TypeScript: o Node executa este fonte
 * removendo tipos, sem transformá-los, e açúcar sintático que
 * gera código não sobrevive a esse modo.
 */
export class ErroPncp extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ErroPncp';
    this.status = status;
  }
}

export class ClientePncp {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly tentativas: number;
  private readonly fetchImpl: typeof fetch;
  private readonly aguardar: (ms: number) => Promise<void>;

  constructor(opcoes: OpcoesCliente = {}) {
    this.base = (opcoes.base ?? BASE_PADRAO).replace(/\/+$/, '');
    this.timeoutMs = opcoes.timeoutMs ?? 30_000;
    this.tentativas = opcoes.tentativas ?? 3;
    this.fetchImpl = opcoes.fetchImpl ?? globalThis.fetch;
    this.aguardar =
      opcoes.aguardar ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Contratações com recebimento de propostas em aberto até
   * `dataFinal`, em todas as modalidades pedidas.
   */
  async contratacoesComPropostaAberta(consulta: ConsultaProposta): Promise<ResultadoConsulta> {
    const contratacoes: ContratacaoBruta[] = [];
    const falhas: { modalidade: number; erro: string }[] = [];

    for (const modalidade of consulta.modalidades) {
      try {
        contratacoes.push(...(await this.paginarModalidade(consulta, modalidade)));
      } catch (erro) {
        falhas.push({ modalidade, erro: erro instanceof Error ? erro.message : String(erro) });
      }
    }

    return { contratacoes: deduplicar(contratacoes), falhas };
  }

  private async paginarModalidade(
    consulta: ConsultaProposta,
    modalidade: number,
  ): Promise<ContratacaoBruta[]> {
    const acumulado: ContratacaoBruta[] = [];

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const url = new URL(`${this.base}/v1/contratacoes/proposta`);
      url.searchParams.set('dataFinal', consulta.dataFinal);
      url.searchParams.set('codigoModalidadeContratacao', String(modalidade));
      url.searchParams.set('uf', consulta.uf.toUpperCase());
      url.searchParams.set('pagina', String(pagina));
      url.searchParams.set('tamanhoPagina', String(TAMANHO_PAGINA));

      const corpo = await this.buscarJson<PaginaBruta<ContratacaoBruta>>(url);
      if (corpo === null) break;

      const itens = corpo.data ?? [];
      acumulado.push(...itens);

      // Sem `paginasRestantes` no envelope, o tamanho da página é
      // o sinal de parada: menos que o teto significa última página.
      const restantes = corpo.paginasRestantes;
      const acabou = restantes !== undefined ? restantes <= 0 : itens.length < TAMANHO_PAGINA;
      if (acabou || itens.length === 0) break;
    }

    return acumulado;
  }

  /**
   * Devolve `null` quando o PNCP responde 204 — que é como ele
   * sinaliza "nenhum resultado" no endpoint de contratações. Um
   * `.json()` sobre corpo vazio quebraria, então esse caso é
   * tratado como ausência, não como erro.
   */
  private async buscarJson<T>(url: URL): Promise<T | null> {
    let ultimoErro: unknown;

    for (let tentativa = 1; tentativa <= this.tentativas; tentativa += 1) {
      try {
        const resposta = await this.fetchImpl(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (resposta.status === 204) return null;

        if (!resposta.ok) {
          const erro = new ErroPncp(
            `PNCP respondeu ${resposta.status} para ${url.pathname}`,
            resposta.status,
          );
          // 4xx é parâmetro errado: repetir não conserta.
          if (resposta.status < 500 && resposta.status !== 429) throw erro;
          ultimoErro = erro;
        } else {
          const texto = await resposta.text();
          if (texto.trim().length === 0) return null;
          return JSON.parse(texto) as T;
        }
      } catch (erro) {
        if (erro instanceof ErroPncp && erro.status !== undefined && erro.status < 500) throw erro;
        ultimoErro = erro;
      }

      if (tentativa < this.tentativas) {
        await this.aguardar(500 * 2 ** (tentativa - 1));
      }
    }

    throw ultimoErro instanceof Error
      ? ultimoErro
      : new ErroPncp(`Falha ao consultar ${url.pathname}`);
  }
}

/**
 * Uma contratação pode chegar duas vezes quando o órgão publica
 * retificação dentro da janela consultada. `numeroControlePNCP`
 * é a chave natural — o último registro vence, por ser o mais
 * recente.
 */
function deduplicar(itens: ContratacaoBruta[]): ContratacaoBruta[] {
  const porChave = new Map<string, ContratacaoBruta>();
  for (const item of itens) {
    const chave =
      item.numeroControlePNCP ??
      `${item.orgaoEntidade?.cnpj ?? '?'}-${item.anoCompra ?? '?'}-${item.sequencialCompra ?? '?'}`;
    porChave.set(chave, item);
  }
  return [...porChave.values()];
}
