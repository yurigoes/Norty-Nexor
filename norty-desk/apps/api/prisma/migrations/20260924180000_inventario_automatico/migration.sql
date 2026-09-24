-- O que o agente de inventário preenche na máquina.
--
-- As linhas que o `migrate diff` emite para as quatro colunas geradas
-- (articles.busca, asset_holdings.isCurrent, clients.buscaNome,
-- clients.documentoDigitos) foram apagadas à mão, como manda a
-- armadilha 2 do CLAUDE.md.

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "agentVersion" TEXT,
ADD COLUMN     "deviceUuid" TEXT,
ADD COLUMN     "hostname" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "osName" TEXT,
ADD COLUMN     "osVersion" TEXT;

-- CreateIndex
--
-- O UUID do SMBIOS é a chave pela qual o agente reconhece a máquina.
-- Duas linhas com o mesmo fariam a varredura seguinte escolher uma das
-- duas ao acaso, e o histórico do equipamento se partiria em dois.
CREATE UNIQUE INDEX "assets_organizationId_deviceUuid_key" ON "assets"("organizationId", "deviceUuid");
