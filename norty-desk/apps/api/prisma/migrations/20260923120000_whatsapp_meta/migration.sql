-- WhatsApp pela API oficial da Meta.
--
-- As linhas que o `migrate diff` emite para as três colunas geradas
-- (articles.busca, clients.buscaNome, clients.documentoDigitos) foram
-- apagadas à mão, como manda a armadilha 2 do CLAUDE.md. Elas
-- derrubariam a busca da base de conhecimento e o trigrama da busca de
-- empresas.

-- CreateEnum
CREATE TYPE "EsperaDoBot" AS ENUM ('EMPRESA', 'ASSUNTO');

-- AlterEnum
ALTER TYPE "ChannelKind" ADD VALUE 'WHATSAPP_META';

-- AlterTable
ALTER TABLE "outbound_messages" ADD COLUMN     "channelAccountId" UUID,
ADD COLUMN     "payload" JSONB;

-- CreateTable
CREATE TABLE "whatsapp_conversas" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "channelAccountId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "clientId" UUID,
    "aguardando" "EsperaDoBot",
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_conversas_expiresAt_idx" ON "whatsapp_conversas"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversas_channelAccountId_phone_key" ON "whatsapp_conversas"("channelAccountId", "phone");

-- CreateIndex
CREATE INDEX "inbound_messages_channelAccountId_fromAddress_receivedAt_idx" ON "inbound_messages"("channelAccountId", "fromAddress", "receivedAt");

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

