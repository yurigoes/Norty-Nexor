/**
 * Análise por IA usando o Gemini (Google AI Studio).
 *
 * Feito direto sobre a API REST, sem SDK: é uma chamada só, e não depender de
 * pacote novo significa que este caminho funciona mesmo quando o `npm install`
 * falha por rede ou antivírus.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Formato exigido da resposta, no subconjunto de OpenAPI que o Gemini aceita. */
const ESQUEMA = {
  type: 'object',
  properties: {
    nota: { type: 'integer' },
    veredito: { type: 'string', enum: ['forte', 'medio', 'fraco'] },
    resumo: { type: 'string' },
    pontosFortes: { type: 'array', items: { type: 'string' } },
    pontosDeAtencao: { type: 'array', items: { type: 'string' } },
    perguntasParaEntrevista: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'nota', 'veredito', 'resumo', 'pontosFortes', 'pontosDeAtencao', 'perguntasParaEntrevista',
  ],
  propertyOrdering: [
    'nota', 'veredito', 'resumo', 'pontosFortes', 'pontosDeAtencao', 'perguntasParaEntrevista',
  ],
};

/** Modelos que existem no catálogo mas não servem para ler texto de currículo. */
const FORA_DE_ESCOPO = /embedding|aqa|imagen|image|tts|audio|live|vision|learnlm|gemma|veo/i;

export const chaveDoAmbiente = () =>
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;

async function pedirAoGoogle(caminho, opcoes = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      'x-goog-api-key': chaveDoAmbiente(),
      'content-type': 'application/json',
      ...opcoes.headers,
    },
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const detalhe = corpo?.error?.message ?? `HTTP ${resposta.status}`;
    const erro = new Error(detalhe);
    erro.status = resposta.status;
    throw erro;
  }
  return corpo;
}

/**
 * Peso de preferência de um modelo.
 *
 * O nome do modelo campeão do Google muda de versão em versão; fixar um aqui
 * envelheceria mal. Em vez disso lemos o catálogo da conta e escolhemos por
 * característica: "flash" é a faixa certa para classificar currículo — rápida e
 * barata o bastante para rodar num lote — e, dentro da faixa, vence a versão
 * mais nova e estável.
 */
function ranquear(id) {
  if (FORA_DE_ESCOPO.test(id)) return null;

  const versao = Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const experimental = /preview|exp|latest/.test(id) ? 0 : 1;
  const faixa = /flash-lite/.test(id) ? 2 : /flash/.test(id) ? 3 : /pro/.test(id) ? 1 : 0;
  if (!faixa) return null;

  return { faixa, estavel: experimental, versao };
}

let modeloEmCache = null;

/** Modelo a usar: o configurado à mão, ou o melhor do catálogo da conta. */
export async function descobrirModelo() {
  if (process.env.TRIAGEM_MODELO_IA) return process.env.TRIAGEM_MODELO_IA;
  if (modeloEmCache) return modeloEmCache;

  const { models = [] } = await pedirAoGoogle('/models');
  const candidatos = models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, '') }))
    .map((m) => ({ ...m, peso: ranquear(m.id) }))
    .filter((m) => m.peso)
    .sort(
      (a, b) =>
        b.peso.faixa - a.peso.faixa ||
        b.peso.estavel - a.peso.estavel ||
        b.peso.versao - a.peso.versao ||
        a.id.localeCompare(b.id),
    );

  if (!candidatos.length) {
    throw new Error(
      'Nenhum modelo de texto do Gemini está liberado para esta chave. Defina TRIAGEM_MODELO_IA com o nome do modelo que você tem.',
    );
  }

  modeloEmCache = candidatos[0].id;
  return modeloEmCache;
}

function erroLegivel(erro) {
  if (erro.status === 400 && /API key not valid/i.test(erro.message)) {
    return 'Chave do Gemini inválida. Confira o valor de GEMINI_API_KEY.';
  }
  if (erro.status === 401 || erro.status === 403) {
    return 'Chave do Gemini recusada. Confira se ela está ativa no Google AI Studio.';
  }
  if (erro.status === 404) {
    return `Modelo não encontrado nesta conta: ${erro.message}. Defina TRIAGEM_MODELO_IA com um modelo que você tenha.`;
  }
  if (erro.status === 429) {
    return 'Limite de requisições do Gemini atingido. Espere alguns segundos e tente de novo.';
  }
  if (erro.name === 'TypeError') {
    return 'Não foi possível falar com a API do Google (sem rede ou proxy bloqueando).';
  }
  return erro.message;
}

/** O Gemini devolve JSON válido, mas não garante o conteúdo: conferimos aqui. */
function validar(bruto) {
  const nota = Number(bruto?.nota);
  const vereditos = ['forte', 'medio', 'fraco'];
  if (!Number.isFinite(nota) || !vereditos.includes(bruto?.veredito)) return null;

  const lista = (valor) => (Array.isArray(valor) ? valor.map(String).filter(Boolean) : []);
  return {
    nota: Math.max(0, Math.min(100, Math.round(nota))),
    veredito: bruto.veredito,
    resumo: String(bruto.resumo ?? ''),
    pontosFortes: lista(bruto.pontosFortes),
    pontosDeAtencao: lista(bruto.pontosDeAtencao),
    perguntasParaEntrevista: lista(bruto.perguntasParaEntrevista),
  };
}

export async function analisar({ instrucoes, conteudo }) {
  try {
    const modelo = await descobrirModelo();
    const resposta = await pedirAoGoogle(`/models/${modelo}:generateContent`, {
      method: 'POST',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucoes }] },
        contents: [{ role: 'user', parts: [{ text: conteudo }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: ESQUEMA,
          // Triagem precisa ser reproduzível: o mesmo currículo não pode
          // mudar de veredito entre duas execuções.
          temperature: 0.2,
        },
      }),
    });

    if (resposta.promptFeedback?.blockReason) {
      return { ok: false, erro: `O Gemini bloqueou a análise (${resposta.promptFeedback.blockReason}).` };
    }

    const candidato = resposta.candidates?.[0];
    if (!candidato || (candidato.finishReason && candidato.finishReason !== 'STOP')) {
      return { ok: false, erro: `O Gemini interrompeu a resposta (${candidato?.finishReason ?? 'sem resposta'}).` };
    }

    const texto = (candidato.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const analise = validar(JSON.parse(texto));
    if (!analise) return { ok: false, erro: 'A resposta do Gemini não veio no formato esperado.' };

    return { ok: true, analise, modelo };
  } catch (erro) {
    if (erro instanceof SyntaxError) {
      return { ok: false, erro: 'A resposta do Gemini não era um JSON válido.' };
    }
    return { ok: false, erro: erroLegivel(erro) };
  }
}
