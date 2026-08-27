/* =========================================================
   LICITA+ API — Varredura manual
   ---------------------------------------------------------
   A ingestão roda sozinha às 5h. Este script existe para as
   duas horas em que esperar até lá não serve:

   - **A primeira carga.** Uma conta recém-criada abre num
     painel vazio até a primeira varredura. Rodar isto logo
     depois do deploy é a diferença entre entregar o produto e
     entregar a promessa dele.
   - **Depois de mexer no perfil.** Trocar linha de
     fornecimento apaga as avaliações para forçar recálculo;
     `--somente-avaliar` refaz as notas sobre o que já está no
     banco, sem consultar o PNCP de novo.

   Uso, dentro do container:

     docker compose exec licita-api node dist/tarefas/ingestao.js
     docker compose exec licita-api node dist/tarefas/ingestao.js BA SE
     docker compose exec licita-api node dist/tarefas/ingestao.js --somente-avaliar
   ========================================================= */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { IngestaoService } from '../modules/ingestao/ingestao.service';

async function principal(): Promise<void> {
  const registro = new Logger('Varredura');
  const argumentos = process.argv.slice(2);
  const somenteAvaliar = argumentos.includes('--somente-avaliar');
  const ufs = argumentos.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());

  // Contexto sem servidor HTTP: este processo não atende
  // requisição nenhuma, e abrir a porta faria dois processos
  // disputarem a mesma.
  const contexto = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const ingestao = contexto.get(IngestaoService);

  try {
    if (somenteAvaliar) {
      const avaliadas = await ingestao.avaliarTodas();
      registro.log(`Reavaliação concluída: ${avaliadas} avaliação(ões) gravada(s).`);
    } else {
      const resumo = await ingestao.executar(ufs.length ? ufs : undefined);
      registro.log(
        `Varredura concluída: ${resumo.consultadas} consultada(s), ${resumo.novas} nova(s), ` +
          `${resumo.atualizadas} atualizada(s), ${resumo.avaliacoes} avaliação(ões).`,
      );
    }
  } finally {
    // Fecha o contexto sempre: sem isso o processo fica preso
    // pela conexão do Prisma e o container nunca termina.
    await contexto.close();
  }
}

principal().catch((erro) => {
  new Logger('Varredura').error(erro instanceof Error ? erro.message : String(erro));
  process.exitCode = 1;
});
