import { ROTULO_TERMO, type TermKind } from '@norty-desk/shared';
import PDFDocument from 'pdfkit';

/** As cores da casa, do `tokens.css`. Ver a nota em `ordem/pdf.ts`. */
const AZUL_900 = '#071E3D';
const TEXTO = '#1A1A1A';
const SUAVE = '#6B7280';
const LINHA = '#E5E7EB';

const MARGEM = 56;
const LARGURA = 595.28;
const ALTURA = 841.89;
const CONTEUDO = LARGURA - MARGEM * 2;

export type DadosDoPdfDoTermo = {
  kind: TermKind;
  /** O texto como foi assinado. Ver `AssetTerm.body`. */
  body: string;
  signedByName: string;
  signedAt: Date;
  assinatura: Buffer | null;
  ativo: { name: string; tag: string | null };
  organizacao: { name: string };
};

function dataHora(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/**
 * O termo em papel.
 *
 * ## O texto sai como está, sem formatação
 *
 * `body` é o que a pessoa assinou, com as quebras de linha que tinha. O
 * PDF as respeita em vez de reflorar o parágrafo: uma cláusula numerada
 * que vira bloco corrido muda a leitura do documento, e o documento é o
 * que vale.
 *
 * ## O rodapé não finge assinatura digital
 *
 * Diz quem assinou, quando, e de que equipamento se trata. Assinatura
 * criptográfica é outro assunto, e afirmar que existe uma seria pior
 * que não ter (`docs/13-carteira-e-campo.md`, seção 6).
 */
export async function termoEmPdf(t: DadosDoPdfDoTermo): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGEM, bufferPages: true });
  const pedacos: Buffer[] = [];
  doc.on('data', (p: Buffer) => pedacos.push(p));
  const pronto = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
  });

  // --- Cabeçalho -----------------------------------------------------
  doc.rect(0, 0, LARGURA, 92).fill(AZUL_900);

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('norty', MARGEM, 28, { continued: true })
    .font('Helvetica')
    .text(' desk');

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#9DB4CE')
    .text(t.organizacao.name, MARGEM, 53);

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#FFFFFF')
    .text(ROTULO_TERMO[t.kind].toUpperCase(), MARGEM, 34, { width: CONTEUDO, align: 'right' });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#9DB4CE')
    .text(
      t.ativo.tag ? `${t.ativo.name} · ${t.ativo.tag}` : t.ativo.name,
      MARGEM,
      52,
      { width: CONTEUDO, align: 'right' },
    );

  // --- O texto assinado ------------------------------------------------
  doc
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor(TEXTO)
    .text(t.body, MARGEM, 126, { width: CONTEUDO, align: 'left', lineGap: 2.5 });

  // --- A assinatura ----------------------------------------------------
  //
  // Depois do texto, onde ele terminar: uma posição fixa cobriria a
  // última cláusula num termo mais longo que o padrão, que é justamente
  // o que acontece quando a casa acrescenta uma.
  let y = doc.y + 28;

  if (y > ALTURA - 190) {
    doc.addPage();
    y = MARGEM + 20;
  }

  if (t.assinatura) {
    try {
      doc.image(t.assinatura, MARGEM, y, { fit: [220, 72] });
    } catch {
      // Imagem corrompida não derruba o documento: o texto e a data
      // continuam valendo, e é o que a pessoa precisa ter na mão.
    }
    y += 76;
  } else {
    y += 40;
  }

  doc.moveTo(MARGEM, y).lineTo(MARGEM + 240, y).strokeColor(LINHA).lineWidth(1).stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(TEXTO)
    .text(t.signedByName, MARGEM, y + 8, { width: 240 });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(SUAVE)
    .text(
      t.assinatura
        ? `Assinado em ${dataHora(t.signedAt)}`
        : `Registrado em ${dataHora(t.signedAt)} — assinatura em papel`,
      MARGEM,
      y + 22,
      { width: 240 },
    );

  // --- Rodapé -----------------------------------------------------------
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i += 1) {
    doc.switchToPage(paginas.start + i);
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(SUAVE)
      .text(
        `${ROTULO_TERMO[t.kind]} · ${t.ativo.name} · ${t.organizacao.name} · ` +
          `Página ${i + 1} de ${paginas.count}`,
        MARGEM,
        ALTURA - 34,
        { width: CONTEUDO, align: 'center', lineBreak: false },
      );
  }

  doc.end();
  return pronto;
}
