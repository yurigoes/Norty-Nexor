-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "externalRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tickets_organizationId_externalRef_key" ON "tickets"("organizationId", "externalRef");

