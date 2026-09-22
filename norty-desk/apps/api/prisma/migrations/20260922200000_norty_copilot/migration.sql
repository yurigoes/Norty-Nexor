-- Norty Copilot: a configuração por organização e a marca de IA no
-- evento.
--
-- Sem as linhas de colunas GERADAS que o `migrate diff` emitiu para
-- `articles.busca`, `clients.buscaNome` e `clients.documentoDigitos`
-- (CLAUDE.md, armadilha 2).

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GEMINI', 'GROQ');

-- AlterTable
ALTER TABLE "ticket_events" ADD COLUMN     "aiGenerated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ai_configs" (
    "organizationId" UUID NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'GEMINI',
    "apiKeyCifrada" TEXT,
    "model" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "ai_configs" ADD CONSTRAINT "ai_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
