import { ROTULO_STATUS, type ConsultaPublica } from '@norty-desk/shared';
import PDFDocument from 'pdfkit';

/**
 * As cores da casa, do `tokens.css` do LICITA+.
 *
 * Repetidas aqui como literais porque o PDF não passa por CSS — é o
 * único lugar do produto onde um hexadecimal escrito à mão é honesto.
 * Se a rampa mudar lá, muda aqui (CLAUDE.md, regra 6).
 */
const AZUL_900 = '#071E3D';
const AZUL_600 = '#005CA9';
const VERDE_600 = '#008C45';
const TEXTO = '#1A1A1A';
const SUAVE = '#6B7280';
const LINHA = '#E5E7EB';

const MARGEM = 48;
const LARGURA = 595.28; // A4 em pontos
const ALTURA = 841.89;
const CONTEUDO = LARGURA - MARGEM * 2;

/** Verde quando terminou, azul enquanto anda. */
function corDoStatus(status: ConsultaPublica['status']): string {
  return status === 'FECHADO' || status === 'SOLUCIONADO' ? VERDE_600 : AZUL_600;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/**
 * O comprovante de protocolo, com a marca da Norty.
 *
 * Sai como `Buffer` e não como fluxo para o controller: o documento
 * tem duas ou três páginas, cabe inteiro na memória, e um `Buffer`
 * deixa o `Content-Length` correto — o que faz a barra de progresso do
 * navegador funcionar em vez de rodar indefinidamente.
 */
export async function comprovanteDeProtocolo(consulta: ConsultaPublica): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGEM, bufferPages: true });
  const pedacos: Buffer[] = [];
  doc.on('data', (p: Buffer) => pedacos.push(p));
  const pronto = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
  });

  // --- Cabeçalho -----------------------------------------------------
  doc.rect(0, 0, LARGURA, 104).fill(AZUL_900);

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(19)
    .text('norty', MARGEM, 32, { continued: true })
    .font('Helvetica')
    .text(' desk');

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('rgba(255,255,255,0.7)')
    .fillColor('#9DB4CE')
    .text('Central de serviços', MARGEM, 57);

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#9DB4CE')
    .text('COMPROVANTE DE PROTOCOLO', MARGEM, 78, {
      width: CONTEUDO,
      align: 'right',
      characterSpacing: 1.2,
    });

  // --- Protocolo em destaque ------------------------------------------
  let y = 140;

  doc.font('Helvetica').fontSize(9).fillColor(SUAVE).text('PROTOCOLO', MARGEM, y, {
    characterSpacing: 1,
  });

  doc
    .font('Courier-Bold')
    .fontSize(26)
    .fillColor(AZUL_900)
    .text(consulta.protocol, MARGEM, y + 14);

  // O selo de situação, alinhado ao protocolo.
  const rotulo = ROTULO_STATUS[consulta.status];
  const largura = doc.font('Helvetica-Bold').fontSize(10).widthOfString(rotulo) + 26;
  doc
    .roundedRect(LARGURA - MARGEM - largura, y + 16, largura, 26, 13)
    .fill(corDoStatus(consulta.status));
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(rotulo, LARGURA - MARGEM - largura, y + 24, { width: largura, align: 'center' });

  y += 62;
  doc.moveTo(MARGEM, y).lineTo(LARGURA - MARGEM, y).strokeColor(LINHA).lineWidth(1).stroke();

  // --- Dados -----------------------------------------------------------
  y += 22;
  y = campo(doc, 'Assunto', consulta.subject, y);
  y = campo(doc, 'Atendimento', consulta.organization, y);
  y = campo(doc, 'Abertura', dataHora(consulta.openedAt), y);

  if (consulta.scheduledFor) {
    y = campo(doc, 'Atendimento agendado para', dataHora(consulta.scheduledFor), y);
  }
  if (consulta.solvedAt) y = campo(doc, 'Solução', dataHora(consulta.solvedAt), y);
  if (consulta.closedAt) y = campo(doc, 'Encerramento', dataHora(consulta.closedAt), y);

  // --- Linha do tempo ---------------------------------------------------
  y += 14;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(AZUL_900)
    .text('Acompanhamento', MARGEM, y);
  y += 22;

  for (const evento of consulta.timeline) {
    // Quebra de página antes de escrever, não depois: o contrário
    // deixa a última linha cortada ao meio na borda da folha.
    if (y > 730) {
      doc.addPage();
      y = MARGEM + 10;
    }

    doc.circle(MARGEM + 4, y + 5, 3.5).fill(AZUL_600);

    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(SUAVE)
      .text(dataHora(evento.at) + (evento.by ? ` · ${evento.by}` : ''), MARGEM + 18, y);

    const texto = doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXTO)
      .heightOfString(evento.text, { width: CONTEUDO - 18 });

    doc.text(evento.text, MARGEM + 18, y + 12, { width: CONTEUDO - 18 });
    y += 12 + texto + 14;
  }

  if (consulta.timeline.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(SUAVE).text('Sem movimentação.', MARGEM, y);
  }

  // --- Rodapé em todas as páginas ---------------------------------------
  //
  // A margem inferior vai a zero antes de escrever o rodapé. Sem isso,
  // escrever abaixo dela faz o PDFKit entender que o texto não cabe e
  // abrir outra página — o que criava uma folha em branco no fim e, de
  // quebra, fazia a contagem dizer "Página 1 de 1" num documento de
  // duas, porque as páginas eram contadas antes de a extra nascer.
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i += 1) {
    doc.switchToPage(paginas.start + i);
    doc.page.margins.bottom = 0;

    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(SUAVE)
      .text(
        `Documento emitido em ${dataHora(new Date().toISOString())} · ` +
          `Protocolo ${consulta.protocol} · Página ${i + 1} de ${paginas.count}`,
        MARGEM,
        ALTURA - 34,
        { width: CONTEUDO, align: 'center', lineBreak: false },
      );
  }

  doc.end();
  return pronto;
}

/** Rótulo pequeno em cima, valor embaixo. Devolve o novo `y`. */
function campo(doc: PDFKit.PDFDocument, rotulo: string, valor: string, y: number): number {
  doc.font('Helvetica').fontSize(8).fillColor(SUAVE).text(rotulo.toUpperCase(), MARGEM, y, {
    characterSpacing: 0.8,
  });

  const altura = doc.font('Helvetica').fontSize(11).heightOfString(valor, { width: CONTEUDO });
  doc.fillColor(TEXTO).text(valor, MARGEM, y + 11, { width: CONTEUDO });

  return y + 11 + altura + 12;
}
