/**
 * Extração de texto dos arquivos de currículo.
 *
 * Formatos aceitos: PDF, DOCX, TXT, RTF e MD. O `.doc` binário antigo não é
 * lido — em vez de devolver lixo, avisamos para converter o arquivo.
 */

import path from 'node:path';
import mammoth from 'mammoth';

/** Diferença vertical, em pontos, a partir da qual consideramos nova linha. */
const SALTO_DE_LINHA = 4;

async function extrairPdf(buffer) {
  // O build "legacy" é o que roda em Node sem worker dedicado.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const documento = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    // Currículo com fonte quebrada não pode derrubar o lote inteiro.
    stopAtErrors: false,
    verbosity: 0,
  }).promise;

  const totalPaginas = documento.numPages;
  const paginas = [];
  for (let n = 1; n <= totalPaginas; n += 1) {
    const pagina = await documento.getPage(n);
    const conteudo = await pagina.getTextContent();
    let linha = '';
    const linhas = [];
    let yAnterior = null;

    for (const item of conteudo.items) {
      if (typeof item.str !== 'string') continue;
      const y = item.transform?.[5] ?? null;
      const mudouDeLinha =
        yAnterior !== null && y !== null && Math.abs(y - yAnterior) > SALTO_DE_LINHA;

      if (mudouDeLinha && linha.trim()) {
        linhas.push(linha.trim());
        linha = '';
      }
      linha += item.str;
      if (item.hasEOL) {
        if (linha.trim()) linhas.push(linha.trim());
        linha = '';
      }
      if (y !== null) yAnterior = y;
    }
    if (linha.trim()) linhas.push(linha.trim());
    paginas.push(linhas.join('\n'));
    pagina.cleanup();
  }
  await documento.destroy();

  return { texto: paginas.join('\n\n'), paginas: totalPaginas };
}

async function extrairDocx(buffer) {
  const { value, messages } = await mammoth.extractRawText({ buffer });
  const erros = messages.filter((m) => m.type === 'error').map((m) => m.message);
  return { texto: value, aviso: erros.length ? erros.join('; ') : null };
}

function extrairRtf(buffer) {
  // Suficiente para currículo simples: derruba grupos de controle e comandos.
  const bruto = buffer.toString('latin1');
  const texto = bruto
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) =>
      Buffer.from(hex, 'hex').toString('latin1'),
    )
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n');
  return { texto };
}

/**
 * Lê um arquivo e devolve `{ texto, aviso, paginas }`.
 * Nunca lança: falha vira `{ texto: '', erro }` para não interromper o lote.
 */
export async function extrairTexto(nomeArquivo, buffer) {
  const extensao = path.extname(nomeArquivo).toLowerCase();
  try {
    let resultado;
    switch (extensao) {
      case '.pdf':
        resultado = await extrairPdf(buffer);
        break;
      case '.docx':
        resultado = await extrairDocx(buffer);
        break;
      case '.txt':
      case '.md':
        resultado = { texto: buffer.toString('utf8') };
        break;
      case '.rtf':
        resultado = extrairRtf(buffer);
        break;
      case '.doc':
        return {
          texto: '',
          erro:
            'Formato .doc (Word 97-2003) não é lido. Abra no Word e salve como .docx ou PDF.',
        };
      default:
        return { texto: '', erro: `Extensão ${extensao || '(sem extensão)'} não suportada.` };
    }

    const texto = (resultado.texto || '').replace(/\r\n?/g, '\n').trim();
    if (!texto) {
      return {
        texto: '',
        erro:
          extensao === '.pdf'
            ? 'PDF sem camada de texto — provavelmente é digitalizado (imagem). Precisa de OCR.'
            : 'Arquivo sem texto legível.',
      };
    }
    return { texto, aviso: resultado.aviso ?? null, paginas: resultado.paginas ?? null };
  } catch (erro) {
    return { texto: '', erro: `Falha ao ler o arquivo: ${erro.message}` };
  }
}
