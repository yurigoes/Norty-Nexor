-- Atendimento marcado para uma data e hora, e o prazo que ele empurra.
--
-- (O `ALTER TABLE "articles" ALTER COLUMN "busca" DROP DEFAULT` que o
-- `migrate diff` emitiu junto foi apagado à mão: `busca` é coluna
-- gerada, e o Prisma não a enxerga. Ver CLAUDE.md, armadilha 2.)

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('AGENDADO', 'REALIZADO', 'CANCELADO');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'AGENDAMENTO';

-- AlterTable
ALTER TABLE "sla_commitments" ADD COLUMN     "postponedSeconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "technicianId" UUID,
    "note" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'AGENDADO',
    "postponedSeconds" INTEGER NOT NULL DEFAULT 0,
    "previousDueAt" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_technicianId_scheduledFor_idx" ON "appointments"("technicianId", "scheduledFor");

-- CreateIndex
CREATE INDEX "appointments_ticketId_status_idx" ON "appointments"("ticketId", "status");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

