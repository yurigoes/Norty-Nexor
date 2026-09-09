-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('NOVO', 'INVESTIGANDO', 'CAUSA_IDENTIFICADA', 'CONTORNO_PUBLICADO', 'RESOLVIDO', 'FECHADO');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('RASCUNHO', 'EM_APROVACAO', 'APROVADA', 'AGENDADA', 'EM_EXECUCAO', 'CONCLUIDA', 'REVERTIDA', 'RECUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ChangeKind" AS ENUM ('PADRAO', 'NORMAL', 'EMERGENCIAL');

-- CreateEnum
CREATE TYPE "ChangeRisk" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "changeId" UUID,
ALTER COLUMN "ticketId" DROP NOT NULL;

-- (Removido: ALTER TABLE "articles" ALTER COLUMN "busca" DROP DEFAULT.
--  Coluna gerada; o Postgres recusa. Ver a nota no CLAUDE.md.)

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "changeId" UUID,
ADD COLUMN     "problemId" UUID,
ALTER COLUMN "ticketId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ticket_events" ADD COLUMN     "changeId" UUID,
ADD COLUMN     "problemId" UUID,
ALTER COLUMN "ticketId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "changeId" UUID,
ADD COLUMN     "problemId" UUID;

-- CreateTable
CREATE TABLE "problems" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'NOVO',
    "urgency" INTEGER NOT NULL DEFAULT 3,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "categoryId" UUID,
    "assignedTeamId" UUID,
    "assignedUserId" UUID,
    "rootCause" TEXT,
    "workaround" TEXT,
    "isKnownError" BOOLEAN NOT NULL DEFAULT false,
    "knownErrorAt" TIMESTAMP(3),
    "articleId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'RASCUNHO',
    "kind" "ChangeKind" NOT NULL DEFAULT 'NORMAL',
    "risk" "ChangeRisk" NOT NULL DEFAULT 'MEDIO',
    "categoryId" UUID,
    "assignedTeamId" UUID,
    "assignedUserId" UUID,
    "implementationPlan" TEXT,
    "testPlan" TEXT,
    "rollbackPlan" TEXT,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "problemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "problems_organizationId_status_idx" ON "problems"("organizationId", "status");

-- CreateIndex
CREATE INDEX "problems_organizationId_isKnownError_idx" ON "problems"("organizationId", "isKnownError");

-- CreateIndex
CREATE UNIQUE INDEX "problems_organizationId_number_key" ON "problems"("organizationId", "number");

-- CreateIndex
CREATE INDEX "changes_organizationId_status_idx" ON "changes"("organizationId", "status");

-- CreateIndex
CREATE INDEX "changes_organizationId_windowStart_idx" ON "changes"("organizationId", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "changes_organizationId_number_key" ON "changes"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_changeId_step_approverId_key" ON "approvals"("changeId", "step", "approverId");

-- CreateIndex
CREATE INDEX "attachments_problemId_idx" ON "attachments"("problemId");

-- CreateIndex
CREATE INDEX "attachments_changeId_idx" ON "attachments"("changeId");

-- CreateIndex
CREATE INDEX "ticket_events_problemId_createdAt_idx" ON "ticket_events"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_events_changeId_createdAt_idx" ON "ticket_events"("changeId", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_problemId_idx" ON "tickets"("problemId");

-- CreateIndex
CREATE INDEX "tickets_changeId_idx" ON "tickets"("changeId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changes" ADD CONSTRAINT "changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changes" ADD CONSTRAINT "changes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changes" ADD CONSTRAINT "changes_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changes" ADD CONSTRAINT "changes_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changes" ADD CONSTRAINT "changes_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Exatamente um dono
-- ---------------------------------------------------------------------
--
-- A linha do tempo e o anexo pertencem a um chamado, a um problema **ou**
-- a uma mudança. Sem este CHECK, o `NULL` em todas as três é aceito — e
-- uma linha órfã na timeline é exatamente o defeito do
-- `(itemtype, items_id)` do GLPI, só que mais caro de descobrir.
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_dono_unico" CHECK (
  ("ticketId" IS NOT NULL)::int
  + ("problemId" IS NOT NULL)::int
  + ("changeId" IS NOT NULL)::int = 1
);

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_dono_unico" CHECK (
  ("ticketId" IS NOT NULL)::int
  + ("problemId" IS NOT NULL)::int
  + ("changeId" IS NOT NULL)::int = 1
);

-- Aprovação é de um chamado ou de uma mudança, nunca das duas.
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_dono_unico" CHECK (
  ("ticketId" IS NOT NULL)::int + ("changeId" IS NOT NULL)::int = 1
);

-- A mesma escala 1..5 dos chamados.
ALTER TABLE "problems" ADD CONSTRAINT "problems_escala" CHECK (
  "urgency" BETWEEN 1 AND 5 AND "impact" BETWEEN 1 AND 5 AND "priority" BETWEEN 1 AND 5
);

-- Janela que termina antes de começar não é janela.
ALTER TABLE "changes" ADD CONSTRAINT "changes_janela" CHECK (
  "windowStart" IS NULL OR "windowEnd" IS NULL OR "windowEnd" > "windowStart"
);

-- Erro conhecido exige causa **e** contorno: é o que separa "sabemos o
-- que é" de "estamos investigando", e é a única coisa que o atendimento
-- precisa saber quando o mesmo problema gera o décimo chamado.
ALTER TABLE "problems" ADD CONSTRAINT "problems_erro_conhecido" CHECK (
  "isKnownError" = false
  OR ("rootCause" IS NOT NULL AND "workaround" IS NOT NULL)
);

-- Busca de problema e de mudança, em português.
CREATE INDEX "problems_busca" ON "problems" USING gin (
  to_tsvector('portuguese', "title" || ' ' || "description")
);

CREATE INDEX "changes_busca" ON "changes" USING gin (
  to_tsvector('portuguese', "title" || ' ' || "description")
);
