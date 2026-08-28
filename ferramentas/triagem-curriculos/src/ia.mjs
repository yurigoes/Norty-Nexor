/**
 * Segunda opinião opcional, com Claude.
 *
 * A pontuação por critérios é literal: ela vê a palavra, não o sentido. Quem
 * escreveu "responsável pelo fechamento mensal das contas do prédio" sabe fazer
 * conciliação sem nunca ter escrito a palavra. A leitura por IA existe para
 * esses casos — é opcional, custa por currículo e nunca substitui a nota
 * objetiva: as duas aparecem lado a lado na tela.
 */

const MODELO = 'claude-opus-5';
const ESFORCO = process.env.TRIAGEM_ESFORCO_IA ?? 'medium';
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

const montarSchema = (z) =>
  z.object({
    nota: z.number().int().min(0).max(100),
    veredito: z.enum(['forte', 'medio', 'fraco']),
    resumo: z.string(),
    pontosFortes: z.array(z.string()),
    pontosDeAtencao: z.array(z.string()),
    perguntasParaEntrevista: z.array(z.string()),
  });

const INSTRUCOES = `Você é analista de recrutamento e avalia currículos para uma vaga específica.

Regras:
- Responda sempre em português do Brasil.
- Baseie-se apenas no que está escrito no currículo. Não invente experiência, formação ou habilidade que não aparece no texto.
- Quando o currículo descreve a atividade sem usar o termo exato da vaga, considere assim mesmo e diga em qual trecho se apoiou.
- "nota" é de 0 a 100 e mede aderência à vaga descrita, não qualidade do candidato em abstrato.
- "veredito": forte (chamar para entrevista), medio (talvez, depende do volume de candidatos), fraco (não chamar).
- "resumo": no máximo três frases, direto, sem elogio genérico.
- "pontosDeAtencao": lacunas reais frente à vaga, incluindo informação que o currículo deixou de fora.
- "perguntasParaEntrevista": no máximo três perguntas que resolvam as dúvidas mais caras dessa candidatura.
- Não considere idade, gênero, estado civil, origem, foto ou aparência do candidato — nem para elogiar, nem para descartar.`;

function descreverVaga(vaga) {
  const criterios = (vaga.criterios ?? [])
    .map((c) => {
      const sinonimos = c.sinonimos?.length ? ` (também vale: ${c.sinonimos.join(', ')})` : '';
      return `- ${c.termo}${sinonimos} — peso ${c.peso}${c.obrigatorio ? ', OBRIGATÓRIO' : ''}`;
    })
    .join('\n');

  const experiencia = vaga.experiencia?.anosMinimos
    ? `\nExperiência mínima esperada: ${vaga.experiencia.anosMinimos} ano(s).`
    : '';

  return `VAGA: ${vaga.titulo}
${vaga.descricao ? `\n${vaga.descricao}\n` : ''}
O que a vaga exige:
${criterios || '- (nenhum critério cadastrado)'}${experiencia}`;
}

const SEM_PACOTE =
  'O pacote @anthropic-ai/sdk não está instalado. Rode `npm install` de novo nesta pasta para habilitar a análise por IA — a triagem por critérios funciona sem ele.';

/**
 * Carrega o SDK só quando a IA é realmente usada.
 *
 * O SDK e o zod são dependências opcionais: se a instalação deles falhar (rede
 * ruim, proxy, antivírus), a ferramenta inteira ainda precisa subir e ler
 * currículos. Import estático aqui derrubaria o servidor no boot.
 */
let dependencias = null;
async function carregarDependencias() {
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

/**
 * Se a análise por IA está utilizável, e por que não está quando não está.
 * A interface usa isso para rotular o botão em vez de deixar o usuário
 * descobrir o problema só depois de clicar.
 */
export async function estadoDaIa() {
  if (!(await carregarDependencias())) {
    return { disponivel: false, mensagem: 'IA indisponível (pacote não instalado)' };
  }
  if (!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
    return { disponivel: false, mensagem: 'IA desligada (sem ANTHROPIC_API_KEY)' };
  }
  return { disponivel: true, mensagem: `IA disponível · ${MODELO}` };
}

/**
 * Analisa um currículo com Claude.
 * Devolve `{ ok: true, analise }` ou `{ ok: false, erro }` — nunca lança, para
 * que a falha de um candidato não derrube a triagem dos outros.
 */
export async function analisarComIa({ vaga, texto, nome }) {
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
      { type: 'text', text: INSTRUCOES },
      // A vaga é idêntica para todos os currículos do lote: marcada para cache,
      // ela é cobrada uma vez e relida barato nos candidatos seguintes.
      { type: 'text', text: descreverVaga(vaga), cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: `CURRÍCULO${nome ? ` DE ${nome}` : ''}:\n\n${texto}`,
      },
    ],
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

    return {
      ok: true,
      analise: resposta.parsed_output,
      uso: {
        entrada: resposta.usage?.input_tokens ?? 0,
        saida: resposta.usage?.output_tokens ?? 0,
        cacheLido: resposta.usage?.cache_read_input_tokens ?? 0,
      },
    };
  } catch (erro) {
    return { ok: false, erro: erroLegivel(Anthropic, erro) };
  }
}
