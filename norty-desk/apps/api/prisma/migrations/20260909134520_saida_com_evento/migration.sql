-- AlterTable
ALTER TABLE "outbound_messages" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "eventId" UUID;

-- CreateIndex
CREATE INDEX "outbound_messages_organizationId_externalId_idx" ON "outbound_messages"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "outbound_messages_ticketId_idx" ON "outbound_messages"("ticketId");
