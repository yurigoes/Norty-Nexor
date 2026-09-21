import { formatarProtocolo } from '@norty-desk/shared';
import PDFDocument from 'pdfkit';

/** As cores da casa, do `tokens.css`. Ver a nota em `publico/pdf.ts`. */
const AZUL_900 = '#071E3D';
const AZUL_600 = '#005CA9';
const VERDE_600 = '#008C45';
const TEXTO = '#1A1A1A';
const SUAVE = '#6B7280';
const LINHA = '#E5E7EB';

const MARGEM = 48;
const LARGURA = 595.28;
const ALTURA = 841.89;
const CONTEUDO = LARGURA - MARGEM * 2;

export type DadosDaOrdem = {
  number: number;
  report: string | null;
  signedByName: string | null;
  signedByRole: string | null;
  signedAt: Date | null;
  createdAt: Date;
  items: { position: number; description: string; done: boolean; notes: string | null }[];
  technician: { name: string } | null;
  organization: { name: string };
  ticket: {
    number: number;
    protocol: string;
    subject: string;
    client: { name: string; document: string | null } | null;
  };
  appointment: { scheduledFor: Date } | null;
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
 * A ordem de serviço em PDF, com a marca da Norty.
 *
 * O carimbo do rodapé carrega o código de verificação — que é o
 * protocolo do chamado. É ele que responde "este documento é mesmo da
 * Norty?": quem tem o papel na mão digita o protocolo na consulta
 * pública e confere que a ordem existe e bate. É a alternativa à
 * assinatura criptográfica que `docs/13-carteira-e-campo.md` registrou.
 */
export async function ordemEmPdf(o: DadosDaOrdem, assinatura: Buffer | null): Promise<Buffer> {
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

  doc.font('Helvetica').fontSize(8.5).fillColor('#9DB4CE').text('Central de serviços', MARGEM, 57);

  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#FFFFFF')
    .text(`ORDEM DE SERVIÇO Nº ${o.number}`, MARGEM, 62, { width: CONTEUDO, align: 'right' });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#9DB4CE')
    .text(`Chamado #${o.ticket.number}`, MARGEM, 80, { width: CONTEUDO, align: 'right' });

  // --- Identificação ---------------------------------------------------
  let y = 134;
  y = campo(doc, 'Cliente', o.ticket.client?.name ?? o.organization.name, y);
  if (o.ticket.client?.document) y = campo(doc, 'Documento', o.ticket.client.document, y);
  y = campo(doc, 'Assunto', o.ticket.subject, y);
  y = campo(doc, 'Técnico', o.technician?.name ?? '—', y);
  if (o.appointment) y = campo(doc, 'Atendimento', dataHora(o.appointment.scheduledFor), y);

  y += 6;
  doc.moveTo(MARGEM, y).lineTo(LARGURA - MARGEM, y).strokeColor(LINHA).lineWidth(1).stroke();
  y += 22;

  // --- Itens ------------------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL_900).text('Serviços a realizar', MARGEM, y);
  y += 20;

  for (const item of o.items) {
    if (y > 660) {
      doc.addPage();
      y = MARGEM + 10;
    }

    // A caixa marcada é a diferença entre "previsto" e "feito", e é o
    // que o cliente confere antes de assinar.
    doc.roundedRect(MARGEM, y, 12, 12, 3).lineWidth(1).strokeColor(item.done ? VERDE_600 : LINHA);
    if (item.done) {
      doc.fillAndStroke(VERDE_600, VERDE_600);
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#FFFFFF')
        .text('✓', MARGEM, y + 2.5, { width: 12, align: 'center' });
    } else {
      doc.stroke();
    }

    const altura = doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(item.done ? TEXTO : SUAVE)
      .heightOfString(item.description, { width: CONTEUDO - 22 });

    doc.text(item.description, MARGEM + 22, y + 1, { width: CONTEUDO - 22 });
    y += Math.max(altura, 12);

    if (item.notes) {
      const nota = doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor(SUAVE)
        .heightOfString(item.notes, { width: CONTEUDO - 22 });
      doc.text(item.notes, MARGEM + 22, y + 3, { width: CONTEUDO - 22 });
      y += nota + 3;
    }

    y += 10;
  }

  if (o.items.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(SUAVE).text('Sem itens.', MARGEM, y);
    y += 20;
  }

  // --- Relato ------------------------------------------------------------
  if (o.report) {
    if (y > 620) {
      doc.addPage();
      y = MARGEM + 10;
    }
    y += 8;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL_900).text('Relato do atendimento', MARGEM, y);
    y += 18;

    const altura = doc.font('Helvetica').fontSize(10).fillColor(TEXTO).heightOfString(o.report, {
      width: CONTEUDO,
    });
    doc.text(o.report, MARGEM, y, { width: CONTEUDO });
    y += altura + 14;
  }

  // --- Assinatura e carimbo ----------------------------------------------
  // Precisam caber juntos: assinatura numa folha e carimbo na seguinte
  // seria um documento que não atesta nada.
  if (y > 520) {
    doc.addPage();
    y = MARGEM + 10;
  }

  y = Math.max(y + 20, 560);

  if (assinatura) {
    try {
      doc.image(assinatura, MARGEM, y - 46, { fit: [200, 52] });
    } catch {
      // PNG que o PDFKit recusou não derruba o documento.
    }
  }

  doc.moveTo(MARGEM, y + 10).lineTo(MARGEM + 220, y + 10).strokeColor(TEXTO).lineWidth(0.8).stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(TEXTO)
    .text(o.signedByName ?? '—', MARGEM, y + 16, { width: 220 });

  if (o.signedByRole) {
    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE).text(o.signedByRole, MARGEM, y + 29, {
      width: 220,
    });
  }

  carimbo(doc, o, y - 46);

  // --- Rodapé -------------------------------------------------------------
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i += 1) {
    doc.switchToPage(paginas.start + i);
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(SUAVE)
      .text(
        `Ordem de serviço nº ${o.number} · Chamado #${o.ticket.number} · ` +
          `Página ${i + 1} de ${paginas.count}`,
        MARGEM,
        ALTURA - 34,
        { width: CONTEUDO, align: 'center', lineBreak: false },
      );
  }

  doc.end();
  return pronto;
}

/**
 * O carimbo da Norty.
 *
 * Não é assinatura criptográfica, e o documento não finge que é: diz o
 * nome, o documento, a data e o **código de verificação**. É esse
 * código que responde "isto é mesmo da Norty?" — quem tiver o papel
 * confere na consulta pública. O A1 fica para quando houver
 * necessidade jurídica (`docs/13-carteira-e-campo.md`, seção 6).
 */
function carimbo(doc: PDFKit.PDFDocument, o: DadosDaOrdem, y: number): void {
  const largura = 210;
  const x = LARGURA - MARGEM - largura;
  const altura = 96;

  doc.roundedRect(x, y, largura, altura, 8).lineWidth(1.4).strokeColor(AZUL_600).stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(AZUL_900)
    .text(o.organization.name, x + 12, y + 12, { width: largura - 24 });

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(SUAVE)
    .text('DOCUMENTO EMITIDO PELO NORTY DESK', x + 12, y + 30, {
      width: largura - 24,
      characterSpacing: 0.5,
    });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(TEXTO)
    .text(
      o.signedAt ? `Concluída em ${dataHora(o.signedAt)}` : 'Em aberto',
      x + 12,
      y + 46,
      { width: largura - 24 },
    );

  doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE).text('CÓDIGO DE VERIFICAÇÃO', x + 12, y + 62, {
    width: largura - 24,
    characterSpacing: 0.5,
  });

  doc
    .font('Courier-Bold')
    .fontSize(12)
    .fillColor(AZUL_600)
    .text(formatarProtocolo(o.ticket.protocol), x + 12, y + 73, { width: largura - 24 });
}

/** Rótulo pequeno em cima, valor embaixo. Devolve o novo `y`. */
function campo(doc: PDFKit.PDFDocument, rotulo: string, valor: string, y: number): number {
  doc.font('Helvetica').fontSize(8).fillColor(SUAVE).text(rotulo.toUpperCase(), MARGEM, y, {
    characterSpacing: 0.8,
  });

  const altura = doc.font('Helvetica').fontSize(11).heightOfString(valor, { width: CONTEUDO });
  doc.fillColor(TEXTO).text(valor, MARGEM, y + 11, { width: CONTEUDO });

  return y + 11 + altura + 10;
}
