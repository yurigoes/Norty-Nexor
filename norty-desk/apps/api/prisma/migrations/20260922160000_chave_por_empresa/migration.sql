-- A chave de integração passa a ser por empresa-cliente.
--
-- Sem as linhas de `articles.busca`, `clients.buscaNome` e
-- `clients.documentoDigitos` que o `migrate diff` emitiu: são colunas
-- GERADAS que o Prisma não enxerga e tenta desfazer a cada migração
-- (CLAUDE.md, armadilha 2). Aplicá-las derrubaria a busca da base de
-- conhecimento e a busca de empresas.

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "clientId" UUID;

-- CreateIndex
CREATE INDEX "api_keys_clientId_idx" ON "api_keys"("clientId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
