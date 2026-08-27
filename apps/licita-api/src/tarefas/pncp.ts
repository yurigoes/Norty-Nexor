/* =========================================================
   LICITA+ API — Diagnóstico da consulta ao PNCP
   ---------------------------------------------------------
   "A varredura trouxe zero" tem causas que o log da ingestão
   não separa: o PNCP respondeu 204 porque não há nada mesmo, ou
   recusou o pedido, ou a rede do container não sai. As três
   terminam em "0 contratações".

   Este comando faz UM pedido por modalidade e mostra a URL
   exata, o status e o que voltou. Roda dentro do container,
   pela mesma rota de rede da varredura real.

     docker compose exec -T licita-api node dist/tarefas/pncp.js
     docker compose exec -T licita-api node dist/tarefas/pncp.js BA
   ========================================================= */

import { paraFormatoPncp, somarDias } from '@nexor/licitacoes-shared';
import { PrismaClient } from '../../gerado/prisma';
import { carregarConfig } from '../config/env';

const config = carregarConfig();
const prisma = new PrismaClient();

// As mesmas da ingestão: as portas de entrada da Lei 14.133.
const MODALIDADES = [6, 8, 12];

const verde = (t: string) => `\x1b[32m${t}\x1b[0m`;
const vermelho = (t: string) => `\x1b[31m${t}\x1b[0m`;
const amarelo = (t: string) => `\x1b[33m${t}\x1b[0m`;

const NOME = { 6: 'Pregão Eletrônico', 8: 'Dispensa', 12: 'Credenciamento' } as const;

/**
 * O `fetch` do Node resume qualquer problema de rede como "fetch
 * failed" e guarda o que aconteceu de verdade em `cause` — DNS,
 * recusa de conexão, TLS. Sem abrir essa camada, o diagnóstico
 * repete a mesma frase vazia que motivou escrevê-lo.
 */
function detalhar(erro: unknown): string {
  if (!(erro instanceof Error)) return String(erro);

  const causa = (erro as { cause?: unknown }).cause;
  if (causa instanceof Error) return `${erro.message}: ${detalhar(causa)}`;

  return erro.message;
}

/**
 * Três desfechos, não dois. "O PNCP respondeu 400" e "não deu
 * para chegar ao PNCP" levam a lugares opostos — um se resolve no
 * parâmetro, o outro na rede — e juntá-los num booleano é o mesmo
 * erro que fazia "0 contratações" não dizer nada.
 */
interface Desfecho {
  estado: 'ok' | 'recusado' | 'limitado' | 'inacessivel';
  registros: number;
}

async function consultar(uf: string, modalidade: number, dataFinal: string): Promise<Desfecho> {
  const url = new URL(`${config.pncp.base}/v1/contratacoes/proposta`);
  url.searchParams.set('dataFinal', dataFinal);
  url.searchParams.set('codigoModalidadeContratacao', String(modalidade));
  url.searchParams.set('uf', uf);
  url.searchParams.set('pagina', '1');
  url.searchParams.set('tamanhoPagina', '50');

  const rotulo = `${uf} · ${NOME[modalidade as 6] ?? modalidade}`;
  console.log(`  ${rotulo}`);
  console.log(`    ${url.toString()}`);

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 30_000);

  try {
    const inicio = Date.now();
    const resposta = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controle.signal,
    });
    const levou = Date.now() - inicio;

    if (resposta.status === 204) {
      console.log(amarelo(`    204 sem conteúdo (${levou}ms) — o PNCP diz que não há nada aqui.`));
      return { estado: 'ok', registros: 0 };
    }

    if (!resposta.ok) {
      const corpo = (await resposta.text()).slice(0, 300);
      console.log(vermelho(`    ${resposta.status} ${resposta.statusText} (${levou}ms)`));

      if (resposta.status === 429) {
        // O corpo do 429 do PNCP é uma página HTML inteira; a
        // primeira linha de texto basta e o resto é ruído.
        const espera = resposta.headers.get('retry-after');
        console.log(amarelo('    Limite de requisições — o pedido está certo, o ritmo é que não.'));
        if (espera) console.log(amarelo(`    O servidor pede ${espera}s de espera.`));
        return { estado: 'limitado', registros: 0 };
      }

      if (corpo) console.log(`    ${corpo}`);
      return { estado: 'recusado', registros: 0 };
    }

    const corpo = (await resposta.json()) as {
      data?: unknown[];
      totalRegistros?: number;
      totalPaginas?: number;
    };

    const itens = corpo.data?.length ?? 0;
    console.log(verde(`    200 · ${itens} nesta página · ${corpo.totalRegistros ?? '?'} no total (${levou}ms)`));

    if (itens > 0) {
      const primeira = corpo.data?.[0] as { objetoCompra?: string; dataEncerramentoProposta?: string };
      console.log(`    ex.: ${(primeira.objetoCompra ?? '').slice(0, 62)}`);
      console.log(`         encerra em ${primeira.dataEncerramentoProposta ?? '?'}`);
    }
    return { estado: 'ok', registros: itens };
  } catch (erro) {
    const mensagem = detalhar(erro);
    console.log(vermelho(`    falhou: ${mensagem}`));

    if (/ECONNREFUSED/.test(mensagem)) {
      console.log(amarelo('    A porta recusou a conexão — algo entre o container e a'));
      console.log(amarelo('    internet está no caminho (proxy, firewall de saída).'));
    } else if (/abort/i.test(mensagem)) {
      console.log(amarelo('    Estourou 30s. O container alcança a internet?'));
      console.log('        docker compose exec licita-api wget -qO- https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261231\\&codigoModalidadeContratacao=6\\&pagina=1');
    } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(mensagem)) {
      console.log(amarelo('    O nome não resolveu — DNS do container.'));
    } else if (/certificate|self.signed/i.test(mensagem)) {
      console.log(amarelo('    TLS recusado. Há proxy interceptando a saída?'));
    }
    return { estado: 'inacessivel', registros: 0 };
  } finally {
    clearTimeout(relogio);
  }
}

async function ultimaExecucao(): Promise<void> {
  const execucao = await prisma.execucaoIngestao.findFirst({ orderBy: { iniciadaEm: 'desc' } });

  if (!execucao) {
    console.log(amarelo('  Nenhuma varredura registrada ainda.'));
    return;
  }

  console.log(`  iniciada    ${execucao.iniciadaEm.toISOString()}`);
  console.log(`  concluída   ${execucao.concluidaEm?.toISOString() ?? vermelho('não terminou')}`);
  console.log(`  estados     ${execucao.ufs.join(', ') || '—'}`);
  console.log(`  consultadas ${execucao.consultadas} · novas ${execucao.novas} · avaliações ${execucao.avaliacoes}`);

  // O que o log da varredura não mostrava: as falhas por
  // modalidade ficam guardadas aqui.
  if (execucao.erro) {
    console.log('');
    console.log(vermelho('  A varredura registrou falhas:'));
    execucao.erro.split(' | ').forEach((linha) => console.log(vermelho(`    ${linha}`)));
  } else {
    console.log(verde('  Sem falhas registradas.'));
  }
}

async function principal(): Promise<void> {
  const ufs = process.argv.slice(2).map((u) => u.toUpperCase());
  const alvos = ufs.length ? ufs : config.pncp.ufs;
  const dataFinal = paraFormatoPncp(somarDias(new Date(), config.pncp.janelaDias));

  console.log('');
  console.log(`  base        ${config.pncp.base}`);
  console.log(`  estados     ${alvos.join(', ')}`);
  console.log(`  janela      ${config.pncp.janelaDias} dias → dataFinal=${dataFinal}`);
  console.log(`  modalidades ${MODALIDADES.join(', ')}`);
  console.log(`  ritmo       ${config.pncp.intervaloMs}ms entre pedidos`);
  console.log('');
  console.log('  ── última varredura ──');
  await ultimaExecucao();
  console.log('');
  console.log('  ── consultando agora ──');
  console.log('');

  const contagem = { ok: 0, recusado: 0, limitado: 0, inacessivel: 0 };
  let registros = 0;
  let primeiro = true;

  for (const uf of alvos) {
    for (const modalidade of MODALIDADES) {
      // O diagnóstico respeita o mesmo ritmo da varredura: um
      // comando que estoura o limite ao investigar o limite não
      // mede coisa alguma.
      if (!primeiro) await new Promise((r) => setTimeout(r, config.pncp.intervaloMs));
      primeiro = false;

      const desfecho = await consultar(uf, modalidade, dataFinal);
      contagem[desfecho.estado] += 1;
      registros += desfecho.registros;
      console.log('');
    }
  }

  const total = contagem.ok + contagem.recusado + contagem.limitado + contagem.inacessivel;

  const noBanco = await prisma.licitacao.count();
  console.log(`  licitações já no banco: ${noBanco}`);
  console.log('');

  // A ordem importa: cada causa exclui a seguinte. Não chegar ao
  // PNCP não se resolve no parâmetro; ser recusado por ele não se
  // resolve na rede; e nenhum dos dois se resolve na janela.
  if (contagem.inacessivel === total) {
    console.log(vermelho('  Nenhuma consulta chegou ao PNCP: é rede, não filtro.'));
    console.log(vermelho('  Nada que se mude em PNCP_UFS ou PNCP_JANELA_DIAS resolve isso.'));
  } else if (contagem.inacessivel > 0) {
    console.log(amarelo(`  ${contagem.inacessivel} de ${total} consultas não chegaram ao PNCP.`));
    console.log(amarelo('  A saída do container responde de forma intermitente — as que'));
    console.log(amarelo('  completaram provam que o endereço e os parâmetros estão certos.'));
  } else if (contagem.limitado > 0) {
    console.log(amarelo(`  ${contagem.limitado} de ${total} consultas bateram no limite do PNCP.`));
    console.log(amarelo('  Rede e parâmetros estão certos — o que sobra é ritmo. A varredura'));
    console.log(amarelo('  pagina dezenas de vezes e derruba o limite bem mais rápido que'));
    console.log(amarelo('  este comando.'));
    console.log('');
    console.log(amarelo(`  Suba PNCP_INTERVALO_MS (hoje ${config.pncp.intervaloMs}ms) no .env e recrie o`));
    console.log(amarelo('  container, ou varra um estado de cada vez:'));
    console.log('      node dist/tarefas/ingestao.js BA');
  } else if (contagem.recusado > 0) {
    console.log(amarelo(`  ${contagem.recusado} de ${total} consultas foram recusadas pelo PNCP.`));
    console.log(amarelo('  O container alcança a API; o pedido é que não foi aceito. O'));
    console.log(amarelo('  status e o corpo acima dizem o motivo — é o que a varredura'));
    console.log(amarelo('  engolia. Corrija o pedido antes de mexer nos filtros.'));
  } else if (registros === 0) {
    console.log(amarelo('  Todas responderam 204: o PNCP não tem contratação com proposta'));
    console.log(amarelo('  aberta nesses estados e modalidades dentro da janela.'));
    console.log(amarelo('  Amplie: PNCP_JANELA_DIAS=60 e PNCP_UFS com mais estados.'));
  } else if (noBanco === 0) {
    // O caso que mais engana: a API pública tem o dado, e mesmo
    // assim o painel está vazio. O problema está entre a consulta
    // e a gravação, não no PNCP.
    console.log(amarelo(`  O PNCP devolveu ${registros} registro(s), mas o banco está vazio.`));
    console.log(amarelo('  A consulta funciona; quem não gravou foi a varredura. Rode-a'));
    console.log(amarelo('  e leia o log: node dist/tarefas/ingestao.js'));
  } else {
    console.log(verde(`  ${registros} registro(s) na consulta, ${noBanco} no banco. Caminho inteiro de pé.`));
    console.log(amarelo('  Se o painel continua vazio, o corte é da triagem, não da coleta:'));
    console.log(amarelo('  o perfil da empresa descartou tudo. Veja "por que não aparece" na tela.'));
  }

  await prisma.$disconnect();
}

principal().catch(async (erro) => {
  console.error(vermelho(erro instanceof Error ? erro.message : String(erro)));
  await prisma.$disconnect();
  process.exitCode = 1;
});
