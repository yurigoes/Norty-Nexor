-- O relógio do SLA para em mais de um status.
--
-- As linhas que o `migrate diff` emite para as três colunas geradas
-- (articles.busca, clients.buscaNome, clients.documentoDigitos) foram
-- apagadas à mão, como manda a armadilha 2 do CLAUDE.md.

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "clockStoppedAt" TIMESTAMP(3);

-- Os chamados que já estão pendentes agora continuam com o relógio
-- parado no mesmo instante em que ficaram pendentes. Sem esta linha,
-- o primeiro `retomar` depois do deploy não descontaria nada — e o
-- tempo de pendência viraria tempo de atendimento.
UPDATE "tickets"
   SET "clockStoppedAt" = "pendingSince"
 WHERE "status" = 'PENDENTE'
   AND "pendingSince" IS NOT NULL;
