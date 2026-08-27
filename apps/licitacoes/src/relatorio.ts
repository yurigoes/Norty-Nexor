/* =========================================================
   Nexor Licitações — Relatório de terminal
   ---------------------------------------------------------
   O relatório existe para ser lido em trinta segundos, de manhã,
   antes do café. Por isso ele lidera pelo prazo e não pela nota:
   a decisão que o leitor precisa tomar é "o que eu faço hoje",
   e o que fecha primeiro é o que se perde.

   A paleta segue a da marca — grafite carrega o texto, dourado é
   acento, vermelho é só alerta real. Cor some sozinha quando a
   saída não é um terminal, para o arquivo do cron não encher de
   sequências de escape.
   ========================================================= */

import type { Motivo, OportunidadeTriada } from '@nexor/licitacoes-shared';
import { descreverPrazo, formatarReal, modalidade } from '@nexor/licitacoes-shared';
import type { RelatorioRadar } from './radar.ts';
import { resumirDescartes } from './radar.ts';

const COR_ATIVA = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

const cor = {
  forte: (t: string) => pintar(t, '1'),
  fraco: (t: string) => pintar(t, '2'),
  dourado: (t: string) => pintar(t, '33'),
  vermelho: (t: string) => pintar(t, '31'),
  verde: (t: string) => pintar(t, '32'),
};

function pintar(texto: string, codigo: string): string {
  return COR_ATIVA ? `\x1b[${codigo}m${texto}\x1b[0m` : texto;
}

export function renderizarRelatorio(relatorio: RelatorioRadar): string {
  const linhas: string[] = [];
  const { aprovadas, descartadas, totalConsultado, falhas } = relatorio;

  linhas.push('');
  linhas.push(cor.forte(cor.dourado('  NEXOR LICITAÇÕES — radar diário')));
  linhas.push(cor.fraco(`  ${relatorio.perfil} · ${formatarData(relatorio.geradoEm)}`));
  linhas.push('');
  linhas.push(
    cor.fraco(
      `  ${totalConsultado} contratações consultadas · ` +
        `${aprovadas.length} aderentes · ${descartadas.length} descartadas`,
    ),
  );

  if (falhas.length > 0) {
    linhas.push('');
    linhas.push(
      cor.vermelho(
        `  ⚠  ${falhas.length} modalidade(s) não puderam ser consultadas — a lista está incompleta:`,
      ),
    );
    for (const falha of falhas) {
      linhas.push(cor.fraco(`     ${modalidade(falha.modalidade).nome}: ${falha.erro}`));
    }
  }

  linhas.push('');

  if (aprovadas.length === 0) {
    linhas.push(cor.fraco('  Nenhuma oportunidade aderente na janela consultada.'));
    linhas.push('');
    linhas.push(...secaoDescartes(descartadas));
    return linhas.join('\n');
  }

  aprovadas.forEach((item, indice) => {
    linhas.push(...cartao(item, indice + 1));
    linhas.push('');
  });

  linhas.push(...secaoDescartes(descartadas));
  linhas.push('');
  linhas.push(
    cor.fraco(
      '  Lembrete: o radar não envia proposta. Enviar é ato vinculante —\n' +
        '  confira o edital inteiro antes de ofertar preço.',
    ),
  );
  linhas.push('');

  return linhas.join('\n');
}

function cartao(item: OportunidadeTriada, posicao: number): string[] {
  const { oportunidade: o, nota, alertas, horasRestantes } = item;
  const linhas: string[] = [];

  const prazo = descreverPrazo(horasRestantes);
  const prazoColorido = urgente(horasRestantes) ? cor.vermelho(prazo) : cor.verde(prazo);

  linhas.push(
    `  ${cor.forte(String(posicao).padStart(2))}. ` +
      `${cor.dourado(`[${String(nota).padStart(3)}]`)} ` +
      `${cor.forte(truncar(o.objeto, 88))}`,
  );

  const valor = o.valorEstimado === null ? 'valor sigiloso' : formatarReal(o.valorEstimado);
  linhas.push(
    cor.fraco(
      `      ${o.unidade.municipio}/${o.unidade.uf} · ${modalidade(o.modalidadeCodigo).nome} · ` +
        `${valor} · `,
    ) + prazoColorido,
  );
  linhas.push(cor.fraco(`      ${truncar(o.orgao.razaoSocial, 84)}`));
  linhas.push(cor.fraco(`      linhas: ${item.linhasAtendidas.join(', ')}`));

  for (const alerta of alertas) {
    const marca = alerta.gravidade === 'critico' ? cor.vermelho('  ▲') : cor.dourado('  ●');
    linhas.push(`    ${marca} ${alerta.mensagem}`);
  }

  linhas.push(cor.fraco(`      edital: ${o.linkPncp}`));
  if (o.linkSistemaOrigem) {
    linhas.push(cor.fraco(`      envio:  ${o.linkSistemaOrigem}`));
  }

  return linhas;
}

/** Detalha a composição da nota — usado com `--explicar`. */
export function explicarNota(motivos: Motivo[]): string[] {
  return motivos.map(
    (m) => `      ${m.peso.padEnd(14)} ${String(Math.round(m.pontos)).padStart(3)}  ${m.explicacao}`,
  );
}

function secaoDescartes(descartadas: RelatorioRadar['descartadas']): string[] {
  if (descartadas.length === 0) return [];
  const linhas = [cor.fraco('  Descartes por motivo:')];
  for (const { motivo, total } of resumirDescartes(descartadas).slice(0, 6)) {
    linhas.push(cor.fraco(`    ${String(total).padStart(5)}  ${motivo}`));
  }
  return linhas;
}

function urgente(horasRestantes: number | null): boolean {
  return horasRestantes !== null && horasRestantes < 48;
}

function truncar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite - 1)}…`;
}

function formatarData(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? iso
    : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
