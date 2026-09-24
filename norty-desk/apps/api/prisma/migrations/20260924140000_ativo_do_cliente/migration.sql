-- De qual empresa-cliente é o equipamento.
--
-- As linhas que o `migrate diff` emite para as quatro colunas geradas
-- (articles.busca, asset_holdings.isCurrent, clients.buscaNome,
-- clients.documentoDigitos) foram apagadas à mão, como manda a
-- armadilha 2 do CLAUDE.md.

-- AlterTable
--
-- Sem backfill: o que já estava cadastrado é equipamento da casa até
-- alguém dizer o contrário. Chutar uma empresa aqui seria inventar
-- inventário, e inventário inventado é pior que inventário vazio.
ALTER TABLE "assets" ADD COLUMN     "clientId" UUID;

-- CreateIndex
CREATE INDEX "assets_organizationId_clientId_idx" ON "assets"("organizationId", "clientId");

-- AddForeignKey
--
-- RESTRICT: apagar a empresa não pode apagar o inventário dela. A
-- carteira já recusa remover empresa com pessoa ou chamado, e agora
-- também com equipamento; isto aqui é a cerca de baixo, para quem
-- apagar por SQL.
ALTER TABLE "assets" ADD CONSTRAINT "assets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
