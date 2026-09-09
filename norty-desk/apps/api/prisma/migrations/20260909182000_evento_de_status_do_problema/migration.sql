-- O problema tem linha do tempo própria, e a mudança de status dele
-- carrega `ProblemStatus`, não `TicketStatus`. Tipo de evento próprio
-- em vez de alargar `MUDANCA_STATUS`.
--
-- (O `ALTER COLUMN "busca" DROP DEFAULT` que o `migrate diff` insiste
-- em gerar para `articles` foi removido: a coluna é GENERATED e o
-- Postgres recusa. Ver CLAUDE.md, armadilha 2.)
ALTER TYPE "EventType" ADD VALUE 'MUDANCA_STATUS_PROBLEMA';
