-- DropIndex
DROP INDEX "webhook_deliveries_status_createdAt_idx";

-- (Removido daqui: ALTER TABLE "articles" ALTER COLUMN "busca" DROP DEFAULT.
--  `busca` é coluna gerada; o Postgres recusa a instrução, e o Prisma
--  só a emite porque não consegue representar `GENERATED ALWAYS AS`.)

-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN     "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_scheduledFor_idx" ON "webhook_deliveries"("status", "scheduledFor");

