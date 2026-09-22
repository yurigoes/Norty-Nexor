-- Destino próprio do modelo de chamado, e a categoria que exige aval.
--
-- As linhas que o `migrate diff` emitiu para `articles.busca`,
-- `clients.buscaNome` e `clients.documentoDigitos` foram apagadas à
-- mão: são colunas GERADAS, o Prisma não as enxerga e tenta desfazê-las
-- a cada migração (CLAUDE.md, armadilha 2). Aplicá-las derrubaria a
-- busca da base de conhecimento e a busca de empresas.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ticket_forms" ADD COLUMN     "defaultAssigneeId" UUID,
ADD COLUMN     "defaultTeamId" UUID;

-- AddForeignKey
ALTER TABLE "ticket_forms" ADD CONSTRAINT "ticket_forms_defaultTeamId_fkey" FOREIGN KEY ("defaultTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_forms" ADD CONSTRAINT "ticket_forms_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
