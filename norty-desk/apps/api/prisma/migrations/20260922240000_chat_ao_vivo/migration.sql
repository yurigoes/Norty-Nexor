-- Chat ao vivo: quem está por perto, e em qual conversa.
--
-- Sem as linhas de colunas GERADAS que o `migrate diff` emitiu para
-- `articles.busca`, `clients.buscaNome` e `clients.documentoDigitos`
-- (CLAUDE.md, armadilha 2).

-- CreateTable
CREATE TABLE "chat_presences" (
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ticketId" UUID,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "typingAt" TIMESTAMP(3),

    CONSTRAINT "chat_presences_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "chat_presences_organizationId_lastSeenAt_idx" ON "chat_presences"("organizationId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "chat_presences_ticketId_idx" ON "chat_presences"("ticketId");

-- AddForeignKey
ALTER TABLE "chat_presences" ADD CONSTRAINT "chat_presences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_presences" ADD CONSTRAINT "chat_presences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_presences" ADD CONSTRAINT "chat_presences_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

