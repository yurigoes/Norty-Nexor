-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANEJADO', 'EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ProjectTaskStatus" AS ENUM ('A_FAZER', 'EM_ANDAMENTO', 'BLOQUEADA', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANEJADO',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "managerId" UUID,
    "teamId" UUID,
    "parentId" UUID,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "realStart" TIMESTAMP(3),
    "realEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tasks" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectTaskStatus" NOT NULL DEFAULT 'A_FAZER',
    "assigneeId" UUID,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "plannedMinutes" INTEGER,
    "spentMinutes" INTEGER NOT NULL DEFAULT 0,
    "percentDone" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "dependsOnId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tickets" (
    "projectId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_tickets_pkey" PRIMARY KEY ("projectId","ticketId")
);

-- CreateTable
CREATE TABLE "agenda_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" UUID NOT NULL,
    "createdById" UUID,
    "ticketId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_organizationId_status_idx" ON "projects"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organizationId_code_key" ON "projects"("organizationId", "code");

-- CreateIndex
CREATE INDEX "project_tasks_projectId_status_position_idx" ON "project_tasks"("projectId", "status", "position");

-- CreateIndex
CREATE INDEX "project_tasks_assigneeId_plannedStart_idx" ON "project_tasks"("assigneeId", "plannedStart");

-- CreateIndex
CREATE INDEX "project_tickets_ticketId_idx" ON "project_tickets"("ticketId");

-- CreateIndex
CREATE INDEX "agenda_events_ownerId_startsAt_idx" ON "agenda_events"("ownerId", "startsAt");

-- CreateIndex
CREATE INDEX "agenda_events_organizationId_startsAt_idx" ON "agenda_events"("organizationId", "startsAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "project_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "project_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tickets" ADD CONSTRAINT "project_tickets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tickets" ADD CONSTRAINT "project_tickets_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Prioridade 1 a 5 e percentual 0 a 100: fora disso é engano, e o quadro
-- e a média do projeto dariam números sem sentido.
ALTER TABLE "projects" ADD CONSTRAINT "projects_prioridade_check" CHECK ("priority" BETWEEN 1 AND 5);
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_percentual_check" CHECK ("percentDone" BETWEEN 0 AND 100);
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_minutos_check"
  CHECK ("spentMinutes" >= 0 AND ("plannedMinutes" IS NULL OR "plannedMinutes" >= 0));

-- Nada termina antes de começar.
ALTER TABLE "projects" ADD CONSTRAINT "projects_datas_check"
  CHECK ("plannedEnd" IS NULL OR "plannedStart" IS NULL OR "plannedEnd" >= "plannedStart");
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_datas_check"
  CHECK ("plannedEnd" IS NULL OR "plannedStart" IS NULL OR "plannedEnd" >= "plannedStart");
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_datas_check" CHECK ("endsAt" >= "startsAt");

-- Ninguém é pai nem predecessor de si mesmo (ciclos mais longos o serviço barra).
ALTER TABLE "projects" ADD CONSTRAINT "projects_pai_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_ciclo_check"
  CHECK (("parentId" IS NULL OR "parentId" <> "id") AND ("dependsOnId" IS NULL OR "dependsOnId" <> "id"));
