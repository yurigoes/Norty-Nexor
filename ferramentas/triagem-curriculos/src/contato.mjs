/**
 * Descoberta de nome, telefone e e-mail dentro do texto do currículo.
 *
 * Currículo não tem formato: o telefone tanto aparece rotulado quanto solto no
 * rodapé. A estratégia é levantar todos os candidatos plausíveis e ranqueá-los
 * por evidência (rótulo por perto, formato de celular, posição no documento),
 * em vez de confiar num único padrão rígido.
 */

/** DDDs em uso no Brasil. Serve de filtro contra número que não é telefone. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68,
  69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95,
  96, 97, 98, 99,
]);

/** Rótulos que, próximos ao número, indicam que ele é de contato direto. */
const PISTAS_WHATSAPP = /(whats\s?app|whatsapp|whats|zap|celular|\bcel\b|\bmovel\b)/i;
const PISTAS_TELEFONE = /(telefone|\btel\b|\bfone\b|contato|\bcontatos\b)/i;

/** Cabeçalhos de currículo que nunca são nome de pessoa. */
const PALAVRAS_DE_SECAO = new Set([
  'curriculo', 'curriculum', 'vitae', 'cv', 'dados', 'pessoais', 'resumo', 'objetivo',
  'perfil', 'profissional', 'experiencia', 'experiencias', 'formacao', 'academica',
  'contato', 'contatos', 'endereco', 'telefone', 'email', 'e-mail', 'informatica',
  'idiomas', 'cursos', 'qualificacoes', 'habilidades', 'competencias', 'sobre',
  'apresentacao', 'area', 'atuacao', 'candidato', 'vaga', 'pretensao', 'salarial',
]);

/** Termos do nome do arquivo que não fazem parte do nome da pessoa. */
const RUIDO_DE_ARQUIVO =
  /\b(curriculo|curriculum|vitae|cv|resume|rh|copia|final|atualizado|novo|doc|arquivo)\b/gi;

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Substitui documentos numéricos por espaços, preservando o comprimento.
 * Mantém os índices válidos para a leitura de contexto ao redor do telefone.
 */
function mascararDocumentos(texto) {
  const padroes = [
    /\d{3}\.\d{3}\.\d{3}-?\d{2}/g,               // CPF
    /\d{2}\.\d{3}\.\d{3}\/\d{4}-?\d{2}/g,        // CNPJ
    /\b\d{5}-\d{3}\b/g,                          // CEP
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,            // data
  ];
  let resultado = texto;
  for (const padrao of padroes) {
    resultado = resultado.replace(padrao, (achado) => ' '.repeat(achado.length));
  }
  return resultado;
}

/** Formata os dígitos como (11) 98876-5432. */
export function formatarTelefone(digitos) {
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}

/**
 * Telefones encontrados, do mais provável para o menos.
 * Cada item: `{ digitos, formatado, celular, pontos }` — `digitos` é DDD + número.
 */
export function extrairTelefones(texto) {
  const limpo = mascararDocumentos(texto);
  const padrao =
    /(?:\+?\s?55[\s.\-]?)?(?:\((\d{2})\)|(?<![\d])(\d{2}))[\s.\-]?(\d{4,5})[\s.\-]?(\d{4})(?![\d])/g;

  const porNumero = new Map();
  for (const achado of limpo.matchAll(padrao)) {
    const ddd = achado[1] ?? achado[2];
    const digitos = `${ddd}${achado[3]}${achado[4]}`;
    if (!DDDS_VALIDOS.has(Number(ddd))) continue;
    if (digitos.length !== 10 && digitos.length !== 11) continue;
    // Celular no Brasil tem nove dígitos e começa em 9; fixo começa em 2-5.
    const celular = digitos.length === 11;
    if (celular && digitos[2] !== '9') continue;
    if (!celular && !/[2-9]/.test(digitos[2])) continue;

    const contexto = limpo.slice(Math.max(0, achado.index - 45), achado.index);
    let pontos = 0;
    if (PISTAS_WHATSAPP.test(contexto)) pontos += 6;
    else if (PISTAS_TELEFONE.test(contexto)) pontos += 3;
    if (celular) pontos += 4;
    if (achado[1]) pontos += 1;                       // DDD entre parênteses
    if (achado.index < limpo.length * 0.25) pontos += 2; // cabeçalho do currículo

    const anterior = porNumero.get(digitos);
    if (!anterior || anterior.pontos < pontos) {
      porNumero.set(digitos, { digitos, formatado: formatarTelefone(digitos), celular, pontos });
    }
  }

  return [...porNumero.values()].sort((a, b) => b.pontos - a.pontos);
}

export function extrairEmail(texto) {
  const achado = texto.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return achado ? achado[0].toLowerCase() : null;
}

export function extrairLinkedin(texto) {
  const achado = texto.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9._-]+/i);
  return achado ? `https://${achado[0].replace(/^https?:\/\//i, '')}` : null;
}

function pareceNome(linha) {
  const limpa = linha.replace(/[|•·–—]/g, ' ').replace(/\s+/g, ' ').trim();
  if (limpa.length < 5 || limpa.length > 60) return null;
  if (/[@:;/\\<>()[\]{}0-9]/.test(limpa)) return null;

  const palavras = limpa.split(' ').filter(Boolean);
  if (palavras.length < 2 || palavras.length > 6) return null;

  const conectores = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
  const significativas = palavras.filter((p) => !conectores.has(semAcento(p).toLowerCase()));
  if (significativas.length < 2) return null;

  for (const palavra of significativas) {
    const base = semAcento(palavra);
    if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(palavra)) return null;
    if (base.length < 2) return null;
    if (PALAVRAS_DE_SECAO.has(base.toLowerCase())) return null;
    // Nome próprio vem em Maiúsculas Iniciais ou em CAIXA ALTA.
    if (!/^[A-ZÀ-Þ]/.test(palavra)) return null;
  }
  return limpa;
}

/** Ajusta CAIXA ALTA para Maiúsculas Iniciais, preservando os conectores. */
function comoNomeProprio(nome) {
  const conectores = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
  return nome
    .toLowerCase()
    .split(' ')
    .map((palavra, indice) =>
      indice > 0 && conectores.has(semAcento(palavra))
        ? palavra
        : palavra.charAt(0).toUpperCase() + palavra.slice(1),
    )
    .join(' ');
}

function nomeDoArquivo(nomeArquivo) {
  const base = nomeArquivo
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(RUIDO_DE_ARQUIVO, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (base.split(' ').filter((p) => p.length > 1).length < 2) return null;
  return comoNomeProprio(base);
}

/**
 * Melhor palpite para o nome do candidato.
 * Ordem: rótulo "Nome:", primeiras linhas do documento, nome do arquivo.
 */
export function extrairNome(texto, nomeArquivo = '') {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const linha of linhas.slice(0, 25)) {
    const rotulado = linha.match(/^nome\s*(?:completo)?\s*[:\-]\s*(.{4,60})$/i);
    if (rotulado) {
      const nome = pareceNome(rotulado[1]);
      if (nome) return { nome: comoNomeProprio(nome), origem: 'rótulo' };
    }
  }

  for (const linha of linhas.slice(0, 12)) {
    const nome = pareceNome(linha);
    if (nome) return { nome: comoNomeProprio(nome), origem: 'texto' };
  }

  const doArquivo = nomeDoArquivo(nomeArquivo);
  if (doArquivo) return { nome: doArquivo, origem: 'arquivo' };

  return { nome: null, origem: null };
}

/** Reúne tudo o que dá para saber sobre como falar com o candidato. */
export function extrairContato(texto, nomeArquivo) {
  const telefones = extrairTelefones(texto);
  const { nome, origem } = extrairNome(texto, nomeArquivo);
  return {
    nome,
    origemDoNome: origem,
    primeiroNome: nome ? nome.split(' ')[0] : null,
    email: extrairEmail(texto),
    linkedin: extrairLinkedin(texto),
    telefone: telefones[0] ?? null,
    outrosTelefones: telefones.slice(1),
  };
}
