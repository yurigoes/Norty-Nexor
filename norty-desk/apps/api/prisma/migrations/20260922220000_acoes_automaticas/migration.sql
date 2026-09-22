-- Ações automáticas: a ação no modelo de chamado e o link de troca de
-- senha, de uso único e vida curta.
--
-- Sem as linhas de colunas GERADAS que o `migrate diff` emitiu para
-- `articles.busca`, `clients.buscaNome` e `clients.documentoDigitos`
-- (CLAUDE.md, armadilha 2).

-- CreateEnum
CREATE TYPE "AcaoAutomatica" AS ENUM ('RESET_DE_SENHA');

-- AlterTable
ALTER TABLE "ticket_forms" ADD COLUMN     "acaoAutomatica" "AcaoAutomatica";

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ticketId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

