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

   4. **O PNCP limita requisições, e o limite é o gargalo real.**
      Uma varredura de três estados são dezenas de páginas; sem
      ritmo, a API corta com 429 e a varredura inteira volta
      vazia. O cliente espaça os pedidos, desacelera sozinho a
      cada 429 e obedece ao `Retry-After` quando ele vem.
   ========================================================= */

import type { ContratacaoBruta, PaginaBruta } from './pncp-tipos.ts';

export const BASE_PADRAO = 'https://pncp.gov.br/api/consulta';

/** Teto do `tamanhoPagina` aceito pelo endpoint de contratações. */
const TAMANHO_PAGINA = 50;

/** Trava contra paginação infinita se a API devolver o envelope errado. */
const MAX_PAGINAS = 40;

/**
 * Espera mínima entre dois pedidos. O PNCP não publica o limite
 * exato, então o número aqui não é o limite — é um ritmo que o
 * cliente sobe sozinho quando leva 429. Começar folgado e
 * apertar sob demanda erra para o lado seguro.
 */
const INTERVALO_PADRAO = 900;

/** Teto do ritmo adaptativo: acima disso a varredura não termina. */
const INTERVALO_MAXIMO = 8_000;

/** Teto de uma espera isolada, inclusive a pedida por `Retry-After`. */
const RECUO_MAXIMO = 30_000;

export interface OpcoesCliente {
  base?: string;
  timeoutMs?: number;
  tentativas?: number;
  /** Espera mínima entre requisições, em ms. */
  intervaloMs?: number;
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

  /** Sobe a cada 429 e não volta a descer dentro da mesma varredura. */
  private intervaloMs: number;
  private jaPediuAlgo = false;

  constructor(opcoes: OpcoesCliente = {}) {
    this.base = (opcoes.base ?? BASE_PADRAO).replace(/\/+$/, '');
    this.timeoutMs = opcoes.timeoutMs ?? 30_000;
    this.tentativas = opcoes.tentativas ?? 3;
    this.intervaloMs = opcoes.intervaloMs ?? INTERVALO_PADRAO;
    this.fetchImpl = opcoes.fetchImpl ?? globalThis.fetch;
    this.aguardar =
      opcoes.aguardar ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  /** Ritmo atual, em ms — para o log dizer quanto o PNCP apertou. */
  get intervaloAtual(): number {
    return this.intervaloMs;
  }

  /**
   * Contratações com recebimento de propostas em aberto até
   * `dataFinal`, em todas as modalidades pedidas.
   */
  async contratacoesComPropostaAberta(consulta: ConsultaProposta): Promise<ResultadoConsulta> {
    const contratacoes: ContratacaoBruta[] = [];
    const falhas: { modalidade: number; erro: string }[] = [];

    for (const modalidade of consulta.modalidades) {
      const { itens, erro } = await this.paginarModalidade(consulta, modalidade);
      contratacoes.push(...itens);
      if (erro) falhas.push({ modalidade, erro });
    }

    return { contratacoes: deduplicar(contratacoes), falhas };
  }

  /**
   * Uma falha na página 12 não invalida as onze anteriores. Antes
   * o erro subia pela pilha e levava junto tudo o que já tinha
   * sido trazido — era assim que uma UF com 870 contratações
   * disponíveis contribuía exatamente zero. Meia lista rotulada
   * como meia lista vale muito mais que lista nenhuma.
   */
  private async paginarModalidade(
    consulta: ConsultaProposta,
    modalidade: number,
  ): Promise<{ itens: ContratacaoBruta[]; erro?: string }> {
    const acumulado: ContratacaoBruta[] = [];

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const url = new URL(`${this.base}/v1/contratacoes/proposta`);
      url.searchParams.set('dataFinal', consulta.dataFinal);
      url.searchParams.set('codigoModalidadeContratacao', String(modalidade));
      url.searchParams.set('uf', consulta.uf.toUpperCase());
      url.searchParams.set('pagina', String(pagina));
      url.searchParams.set('tamanhoPagina', String(TAMANHO_PAGINA));

      let corpo: PaginaBruta<ContratacaoBruta> | null;

      try {
        corpo = await this.buscarJson<PaginaBruta<ContratacaoBruta>>(url);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        return {
          itens: acumulado,
          erro:
            `página ${pagina}: ${mensagem}` +
            (acumulado.length > 0 ? ` — ${acumulado.length} registro(s) anteriores mantidos` : ''),
        };
      }

      if (corpo === null) break;

      const itens = corpo.data ?? [];
      acumulado.push(...itens);

      // Sem `paginasRestantes` no envelope, o tamanho da página é
      // o sinal de parada: menos que o teto significa última página.
      const restantes = corpo.paginasRestantes;
      const acabou = restantes !== undefined ? restantes <= 0 : itens.length < TAMANHO_PAGINA;
      if (acabou || itens.length === 0) break;
    }

    return { itens: acumulado };
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
      await this.respeitarORitmo();

      // Recuo do 500: falha de servidor costuma passar rápido.
      let recuo = 500 * 2 ** (tentativa - 1);

      try {
        const resposta = await this.fetchImpl(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (resposta.status === 204) return null;

        if (!resposta.ok) {
          // Num 4xx o corpo é a explicação — qual parâmetro o PNCP
          // não aceitou. Descartá-lo deixa quem lê o log com o
          // número do status e mais nada.
          const motivo = await resposta.text().then(
            (t) => t.trim().slice(0, 200),
            () => '',
          );

          const erro = new ErroPncp(
            `PNCP respondeu ${resposta.status} para ${url.pathname}` +
              (motivo ? ` — ${motivo}` : ''),
            resposta.status,
          );

          if (resposta.status === 429) {
            // Não é o pedido que está errado, é o ritmo. Repetir
            // no mesmo passo só gasta a próxima tentativa: o
            // cliente afrouxa o ritmo de vez e espera mais.
            this.desacelerar();
            recuo = this.esperaPedida(resposta) ?? Math.min(this.intervaloMs * 4, RECUO_MAXIMO);
          } else if (resposta.status < 500) {
            // 4xx de verdade é parâmetro errado: repetir não conserta.
            throw erro;
          }

          ultimoErro = erro;
        } else {
          const texto = await resposta.text();
          if (texto.trim().length === 0) return null;
          return JSON.parse(texto) as T;
        }
      } catch (erro) {
        if (
          erro instanceof ErroPncp &&
          erro.status !== undefined &&
          erro.status < 500 &&
          erro.status !== 429
        ) {
          throw erro;
        }
        ultimoErro = erro;
      }

      if (tentativa < this.tentativas) {
        await this.aguardar(recuo);
      }
    }

    throw ultimoErro instanceof Error
      ? ultimoErro
      : new ErroPncp(`Falha ao consultar ${url.pathname}`);
  }

  /**
   * Espaça os pedidos. Dormir *entre* requisições, em vez de mirar
   * um relógio, faz o ritmo real ser um pouco mais lento que o
   * configurado — e num limite que não se conhece, errar para o
   * lado lento é errar de graça: a varredura roda às 5h.
   */
  private async respeitarORitmo(): Promise<void> {
    if (!this.jaPediuAlgo) {
      this.jaPediuAlgo = true;
      return;
    }
    await this.aguardar(this.intervaloMs);
  }

  private desacelerar(): void {
    this.intervaloMs = Math.min(Math.round(this.intervaloMs * 1.8), INTERVALO_MAXIMO);
  }

  /**
   * `Retry-After` vem em segundos ou como data HTTP. Quando o
   * servidor diz quanto esperar, essa é a melhor informação que
   * existe — melhor que qualquer curva de recuo adivinhada.
   */
  private esperaPedida(resposta: Response): number | null {
    const cabecalho = resposta.headers?.get?.('retry-after');
    if (!cabecalho) return null;

    const segundos = Number(cabecalho.trim());
    if (Number.isFinite(segundos) && segundos >= 0) {
      return Math.min(segundos * 1000, RECUO_MAXIMO);
    }

    const quando = Date.parse(cabecalho);
    if (Number.isNaN(quando)) return null;

    return Math.min(Math.max(quando - Date.now(), 0), RECUO_MAXIMO);
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
