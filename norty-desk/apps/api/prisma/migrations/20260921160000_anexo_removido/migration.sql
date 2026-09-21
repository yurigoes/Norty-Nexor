-- O anexo retirado deixa marca na linha do tempo.
--
-- (O `ALTER TABLE "articles" ALTER COLUMN "busca" DROP DEFAULT` que o
-- `migrate diff` emitiu junto foi apagado à mão: `busca` é coluna
-- gerada, e o Prisma não a enxerga. Ver CLAUDE.md, armadilha 2.)
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ANEXO_REMOVIDO';
