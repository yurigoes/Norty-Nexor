-- Dicionário de modelo e de sistema operacional.
--
-- Fecha a última lacuna de "dicionários de regra" da Fase 7. Duas
-- formas diferentes, porque os dois problemas são diferentes:
--
--   `asset_model_aliases` aponta para uma linha do catálogo, igual ao
--   apelido de fabricante. É o que deixa alguém ensinar que o código
--   "20XW00AABR" que a Lenovo manda é o ThinkPad T14 Gen 2.
--
--   `operating_system_aliases` não aponta para nada: é regra de
--   reescrita, "este caption quer dizer este produto e esta edição".
--   Não há tabela de sistema operacional porque nada consulta um SO
--   pelo id — ver o comentário no schema.
--
-- As duas colunas novas em `assets` nascem nulas de propósito. Reduzir
-- caption a produto é função de `packages/shared`, e reescrevê-la em SQL
-- daria uma segunda verdade que envelhece sozinha. Quem as preenche é
-- `POST /operating-systems/reclassificar`, que roda a função de
-- verdade — e é a mesma porta que a casa usa depois de ensinar um
-- apelido novo.

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "osEdition" TEXT,
ADD COLUMN     "osProduct" TEXT;

-- CreateTable
CREATE TABLE "asset_model_aliases" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetModelId" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_model_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_system_aliases" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "edition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_system_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_model_aliases_assetModelId_idx" ON "asset_model_aliases"("assetModelId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_model_aliases_organizationId_alias_key" ON "asset_model_aliases"("organizationId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "operating_system_aliases_organizationId_alias_key" ON "operating_system_aliases"("organizationId", "alias");

-- CreateIndex
CREATE INDEX "assets_organizationId_osProduct_idx" ON "assets"("organizationId", "osProduct");

-- AddForeignKey
ALTER TABLE "asset_model_aliases" ADD CONSTRAINT "asset_model_aliases_assetModelId_fkey" FOREIGN KEY ("assetModelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_system_aliases" ADD CONSTRAINT "operating_system_aliases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

