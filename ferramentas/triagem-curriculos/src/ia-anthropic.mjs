/**
 * Análise por IA usando Claude.
 *
 * O SDK é dependência opcional e só é carregado quando este provedor é
 * realmente usado — sem isso, a falta do pacote derrubaria o servidor no boot.
 */

const MODELO = 'claude-opus-5';
const ESFORCO = process.env.TRIAGEM_ESFORCO_IA ?? 'medium';
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

export const SEM_PACOTE =
  'O pacote @anthropic-ai/sdk não está instalado. Rode `npm install` de novo nesta pasta para usar o Claude — ou use o Gemini, que não precisa de pacote nenhum.';

export const chaveDoAmbiente = () =>
  process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || null;

const montarSchema = (z) =>
  z.object({
    nota: z.number().int().min(0).max(100),
    veredito: z.enum(['forte', 'medio', 'fraco']),
    resumo: z.string(),
    pontosFortes: z.array(z.string()),
    pontosDeAtencao: z.array(z.string()),
    perguntasParaEntrevista: z.array(z.string()),
  });

let dependencias = null;
export async function carregarDependencias() {
  if (dependencias) return dependencias;
  try {
    const [sdk, zod, ajuda, ajudaBeta] = await Promise.all([
      import('@anthropic-ai/sdk'),
      import('zod'),
      import('@anthropic-ai/sdk/helpers/zod'),
      import('@anthropic-ai/sdk/helpers/beta/zod'),
    ]);
    dependencias = {
      Anthropic: sdk.default,
      zodOutputFormat: ajuda.zodOutputFormat,
      betaZodOutputFormat: ajudaBeta.betaZodOutputFormat,
      AnaliseSchema: montarSchema(zod.z),
    };
  } catch {
    return null;
  }
  return dependencias;
}

let clienteEmCache = null;
function obterCliente(Anthropic) {
  // O SDK resolve a credencial sozinho: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN
  // ou o perfil gravado por `ant auth login`.
  clienteEmCache ??= new Anthropic();
  return clienteEmCache;
}

function erroLegivel(Anthropic, erro) {
  if (erro instanceof Anthropic.AuthenticationError) {
    return 'Credencial da API inválida ou ausente. Defina ANTHROPIC_API_KEY antes de iniciar a ferramenta.';
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return 'Limite de requisições atingido. Espere alguns segundos e tente de novo.';
  }
  if (erro instanceof Anthropic.BadRequestError) {
    return `Requisição recusada pela API: ${erro.message}`;
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return 'Não foi possível falar com a API (sem rede ou proxy bloqueando).';
  }
  if (erro instanceof Anthropic.APIError) {
    return `Erro ${erro.status} da API: ${erro.message}`;
  }
  return erro.message;
}

export async function analisar({ instrucoes, vagaDescrita, curriculo }) {
  const deps = await carregarDependencias();
  if (!deps) return { ok: false, erro: SEM_PACOTE };

  const { Anthropic, zodOutputFormat, betaZodOutputFormat, AnaliseSchema } = deps;
  let cliente;
  try {
    cliente = obterCliente(Anthropic);
  } catch (erro) {
    return { ok: false, erro: erroLegivel(Anthropic, erro) };
  }

  const requisicao = {
    model: MODELO,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: instrucoes },
      // A vaga é idêntica para todos os currículos do lote: marcada para cache,
      // ela é cobrada uma vez e relida barato nos candidatos seguintes.
      { type: 'text', text: vagaDescrita, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: curriculo }],
  };

  // Cada namespace tem o seu conversor de schema; trocar um pelo outro quebra
  // a validação da resposta.
  const tentar = async (comFallback) =>
    comFallback
      ? cliente.beta.messages.parse({
          ...requisicao,
          output_config: { format: betaZodOutputFormat(AnaliseSchema), effort: ESFORCO },
          betas: [BETA_FALLBACK],
          fallbacks: 'default',
        })
      : cliente.messages.parse({
          ...requisicao,
          output_config: { format: zodOutputFormat(AnaliseSchema), effort: ESFORCO },
        });

  try {
    let resposta;
    try {
      // Com `fallbacks`, uma recusa por política é reexecutada no modelo
      // seguinte dentro da mesma chamada, em vez de voltar vazia.
      resposta = await tentar(true);
    } catch (erro) {
      // Conta sem esse beta habilitado: refaz a chamada sem ele, e só então
      // desiste. Assim o recurso opcional não derruba a análise.
      if (!(erro instanceof Anthropic.BadRequestError)) throw erro;
      resposta = await tentar(false);
    }

    if (resposta.stop_reason === 'refusal') {
      return { ok: false, erro: 'A API recusou a análise deste currículo.' };
    }
    if (!resposta.parsed_output) {
      return { ok: false, erro: 'A resposta da API não veio no formato esperado.' };
    }

    return { ok: true, analise: resposta.parsed_output, modelo: MODELO };
  } catch (erro) {
    return { ok: false, erro: erroLegivel(Anthropic, erro) };
  }
}
