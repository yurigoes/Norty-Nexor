#!/usr/bin/env node
/* =========================================================
   Nexor Licitações — Linha de comando
   ---------------------------------------------------------
   Entrada única do radar. Feita para rodar tanto à mão quanto
   num cron diário, então: código de saída significativo, `--json`
   para encadear com outra ferramenta, e nenhuma pergunta
   interativa.

   Códigos de saída
     0  rodou e encontrou oportunidades aderentes
     1  erro de configuração ou de execução
     2  rodou, consultou, mas nada aderente na janela

   O 2 é separado do 0 de propósito: no cron ele permite disparar
   notificação só quando há algo a fazer, sem tratar "dia vazio"
   como falha.
   ========================================================= */

import { parseArgs } from 'node:util';
import { ErroDeConfiguracao, CAMINHO_PADRAO, lerPerfil } from './config.ts';
import { executarRadar } from './radar.ts';
import { explicarNota, renderizarRelatorio } from './relatorio.ts';

const AJUDA = `
Nexor Licitações — radar de oportunidades no PNCP

  node src/cli.ts [opções]

Opções
  --perfil <arquivo>   Perfil da empresa (padrão: ${CAMINHO_PADRAO})
  --dias <n>           Janela de prazos à frente, em dias (padrão: 30)
  --minimo <n>         Só exibe oportunidades com nota igual ou maior
  --json               Saída em JSON, para encadear com outra ferramenta
  --explicar           Detalha a composição da nota de cada oportunidade
  --ajuda              Mostra esta mensagem

O radar consulta, filtra e ordena. Ele não envia proposta e não
dá lance: enviar proposta é ato jurídico vinculante e continua
sendo uma decisão sua, feita na plataforma do órgão.
`;

async function principal(): Promise<number> {
  const { values } = parseArgs({
    options: {
      perfil: { type: 'string', default: CAMINHO_PADRAO },
      dias: { type: 'string', default: '30' },
      minimo: { type: 'string', default: '0' },
      json: { type: 'boolean', default: false },
      explicar: { type: 'boolean', default: false },
      ajuda: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.ajuda) {
    process.stdout.write(`${AJUDA}\n`);
    return 0;
  }

  const janelaDias = inteiro(values.dias, 'dias');
  const notaMinima = inteiro(values.minimo, 'minimo');

  const perfil = await lerPerfil(values.perfil);
  const relatorio = await executarRadar(perfil, { janelaDias });

  const filtrado = {
    ...relatorio,
    aprovadas: relatorio.aprovadas.filter((item) => item.nota >= notaMinima),
  };

  if (values.json) {
    process.stdout.write(`${JSON.stringify(filtrado, null, 2)}\n`);
  } else {
    process.stdout.write(renderizarRelatorio(filtrado));
    if (values.explicar) {
      for (const item of filtrado.aprovadas) {
        process.stdout.write(`\n  ${item.oportunidade.id} — nota ${item.nota}\n`);
        process.stdout.write(`${explicarNota(item.motivos).join('\n')}\n`);
      }
      process.stdout.write('\n');
    }
  }

  // Falha de consulta significa lista incompleta — o cron precisa
  // saber disso, mesmo que algo tenha sido encontrado.
  if (filtrado.falhas.length > 0) return 1;
  return filtrado.aprovadas.length > 0 ? 0 : 2;
}

function inteiro(valor: string | undefined, nome: string): number {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0) {
    throw new ErroDeConfiguracao(`--${nome} precisa ser um número inteiro positivo (recebi "${valor}")`);
  }
  return numero;
}

principal()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((erro: unknown) => {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    process.stderr.write(`\n  ✖ ${mensagem}\n\n`);
    process.exitCode = 1;
  });
