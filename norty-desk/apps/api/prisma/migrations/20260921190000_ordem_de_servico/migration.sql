-- Ordem de serviço do atendimento em campo, com itens e assinatura.
--
-- (O `ALTER TABLE "articles" ALTER COLUMN "busca" DROP DEFAULT` que o
-- `migrate diff` emitiu junto foi apagado à mão: `busca` é coluna
-- gerada, e o Prisma não a enxerga. Ver CLAUDE.md, armadilha 2.)

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('RASCUNHO', 'EXECUTANDO', 'CONCLUIDA', 'CANCELADA');

-- AlterTable

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'RASCUNHO',
    "appointmentId" UUID,
    "technicianId" UUID,
    "report" TEXT,
    "signatureKey" TEXT,
    "signedByName" TEXT,
    "signedByRole" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "service_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_orders_ticketId_idx" ON "service_orders"("ticketId");

-- CreateIndex
CREATE INDEX "service_orders_technicianId_status_idx" ON "service_orders"("technicianId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_organizationId_number_key" ON "service_orders"("organizationId", "number");

-- CreateIndex
CREATE INDEX "service_order_items_orderId_position_idx" ON "service_order_items"("orderId", "position");

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

