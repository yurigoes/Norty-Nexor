-- Chamado recorrente: a manutenção preventiva em agenda.
--
-- (O `ALTER COLUMN "busca" DROP DEFAULT` que o `migrate diff` insiste em
-- gerar para `articles` foi removido: a coluna é GENERATED e o Postgres
-- recusa. Ver CLAUDE.md, armadilha 2.)
-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "recurringTicketId" UUID;

-- CreateTable
CREATE TABLE "recurring_tickets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ticketType" "TicketType" NOT NULL DEFAULT 'REQUISICAO',
    "urgency" INTEGER NOT NULL DEFAULT 3,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "categoryId" UUID,
    "assignedTeamId" UUID,
    "requesterId" UUID NOT NULL,
    "schedule" JSONB NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "createBeforeSeconds" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_tickets_isActive_nextRunAt_idx" ON "recurring_tickets"("isActive", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_tickets_organizationId_name_key" ON "recurring_tickets"("organizationId", "name");

-- CreateIndex
CREATE INDEX "tickets_recurringTicketId_idx" ON "tickets"("recurringTicketId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_recurringTicketId_fkey" FOREIGN KEY ("recurringTicketId") REFERENCES "recurring_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Escala 1..5 como no chamado, e antecedência não é negativa.
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_escala" CHECK (
  "urgency" BETWEEN 1 AND 5 AND "impact" BETWEEN 1 AND 5);

ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_antecedencia" CHECK (
  "createBeforeSeconds" >= 0);

-- Vigência que termina antes de começar nunca dispara, e uma agenda que
-- nunca dispara é pior que nenhuma: ela aparece ativa na lista.
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_vigencia" CHECK (
  "startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");
