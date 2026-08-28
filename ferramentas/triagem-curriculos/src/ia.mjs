/**
 * Segunda opinião opcional, com IA.
 *
 * A pontuação por critérios é literal: ela vê a palavra, não o sentido. Quem
 * escreveu "responsável pelo fechamento mensal das contas do prédio" sabe fazer
 * conciliação sem nunca ter escrito a palavra. A leitura por IA existe para
 * esses casos — é opcional, custa por currículo e nunca substitui a nota
 * objetiva: as duas aparecem lado a lado na tela.
 *
 * Dois provedores atendem a isso, e o prompt é o mesmo para os dois; o que
 * muda é só como cada API recebe o pedido e devolve o JSON.
 */

import * as gemini from './ia-gemini.mjs';
import * as anthropic from './ia-anthropic.mjs';

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
    : '\nA vaga não exige tempo mínimo de experiência.';

  return `VAGA: ${vaga.titulo}
${vaga.descricao ? `\n${vaga.descricao}\n` : ''}
O que a vaga exige:
${criterios || '- (nenhum critério cadastrado)'}${experiencia}`;
}

const NOMES = { gemini: 'Gemini', anthropic: 'Claude' };

/**
 * Qual provedor usar.
 * `TRIAGEM_IA` decide quando as duas chaves existem; sem ela, vale a que
 * estiver definida.
 */
function escolherProvedor() {
  const forcado = (process.env.TRIAGEM_IA ?? '').trim().toLowerCase();
  if (['gemini', 'google'].includes(forcado)) return 'gemini';
  if (['anthropic', 'claude'].includes(forcado)) return 'anthropic';
  if (gemini.chaveDoAmbiente()) return 'gemini';
  if (anthropic.chaveDoAmbiente()) return 'anthropic';
  return null;
}

/**
 * Se a análise por IA está utilizável, e por que não está quando não está.
 * A interface usa isso para rotular o botão em vez de deixar o usuário
 * descobrir o problema só depois de clicar.
 */
export async function estadoDaIa() {
  const provedor = escolherProvedor();
  if (!provedor) {
    return { disponivel: false, mensagem: 'IA desligada (sem GEMINI_API_KEY nem ANTHROPIC_API_KEY)' };
  }

  if (provedor === 'gemini') {
    if (!gemini.chaveDoAmbiente()) {
      return { disponivel: false, mensagem: 'Gemini escolhido, mas falta GEMINI_API_KEY' };
    }
    // Só descobre o modelo se ele não foi fixado à mão — a chamada custa uma
    // ida à rede, e uma chave errada aparece aqui em vez de no primeiro clique.
    try {
      const modelo = await gemini.descobrirModelo();
      return { disponivel: true, provedor, mensagem: `IA disponível · ${modelo}` };
    } catch (erro) {
      return { disponivel: false, mensagem: `Gemini indisponível: ${erro.message}` };
    }
  }

  if (!(await anthropic.carregarDependencias())) {
    return { disponivel: false, mensagem: 'Claude indisponível (pacote não instalado)' };
  }
  if (!anthropic.chaveDoAmbiente()) {
    return { disponivel: false, mensagem: 'Claude escolhido, mas falta ANTHROPIC_API_KEY' };
  }
  return { disponivel: true, provedor, mensagem: 'IA disponível · claude-opus-5' };
}

/**
 * Analisa um currículo.
 * Devolve `{ ok: true, analise }` ou `{ ok: false, erro }` — nunca lança, para
 * que a falha de um candidato não derrube a triagem dos outros.
 */
export async function analisarComIa({ vaga, texto, nome }) {
  const provedor = escolherProvedor();
  if (!provedor) {
    return {
      ok: false,
      erro: 'Nenhuma chave de IA configurada. Defina GEMINI_API_KEY (Google AI Studio) ou ANTHROPIC_API_KEY.',
    };
  }

  const vagaDescrita = descreverVaga(vaga);
  const curriculo = `CURRÍCULO${nome ? ` DE ${nome}` : ''}:\n\n${texto}`;

  const resultado =
    provedor === 'gemini'
      ? await gemini.analisar({ instrucoes: INSTRUCOES, conteudo: `${vagaDescrita}\n\n${curriculo}` })
      : await anthropic.analisar({ instrucoes: INSTRUCOES, vagaDescrita, curriculo });

  return { ...resultado, provedor: NOMES[provedor] };
}
