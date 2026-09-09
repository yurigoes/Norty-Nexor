-- Catálogo do ativo: localização em árvore, fabricante e modelo.
--
-- A ordem importa: as tabelas nascem, as colunas novas entram, o texto
-- livre que já existe vira linha de catálogo, e só então as colunas de
-- texto caem. Deixar o `migrate diff` mandar dropava fabricante,
-- modelo e localização de todo ativo já cadastrado.
--
-- (O `ALTER COLUMN "busca" DROP DEFAULT` de `articles` foi removido:
-- a coluna é GENERATED e o Postgres recusa. CLAUDE.md, armadilha 2.)

-- 1. As colunas novas, ainda vazias.
ALTER TABLE "assets" ADD COLUMN "assetModelId" UUID,
                     ADD COLUMN "locationId" UUID,
                     ADD COLUMN "manufacturerId" UUID;

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_models" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "manufacturerId" UUID,
    "kind" "AssetKind" NOT NULL DEFAULT 'OUTRO',
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_organizationId_idx" ON "locations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organizationId_parentId_name_key" ON "locations"("organizationId", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_organizationId_name_key" ON "manufacturers"("organizationId", "name");

-- CreateIndex
CREATE INDEX "asset_models_organizationId_kind_idx" ON "asset_models"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "asset_models_organizationId_manufacturerId_name_key" ON "asset_models"("organizationId", "manufacturerId", "name");

-- CreateIndex
CREATE INDEX "assets_locationId_idx" ON "assets"("locationId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assetModelId_fkey" FOREIGN KEY ("assetModelId") REFERENCES "asset_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. O texto livre vira catálogo.
--
-- Agrupa por `lower(trim(...))` — "HP", "hp" e " Hp " viram uma linha
-- só, porque texto livre é a origem da sujeira de inventário — e adota
-- a **primeira grafia** como nome. `initcap` seria pior que o problema:
-- transformaria "HP" em "Hp" e "IBM" em "Ibm".
INSERT INTO "locations" ("id", "organizationId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), d."organizationId", d.nome, now(), now()
FROM (
  SELECT "organizationId", min(trim("location")) AS nome, lower(trim("location")) AS chave
  FROM "assets" WHERE "location" IS NOT NULL AND trim("location") <> ''
  GROUP BY "organizationId", lower(trim("location"))
) d;

UPDATE "assets" a SET "locationId" = l."id"
FROM "locations" l
WHERE l."organizationId" = a."organizationId"
  AND lower(l."name") = lower(trim(a."location"));

INSERT INTO "manufacturers" ("id", "organizationId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), d."organizationId", d.nome, now(), now()
FROM (
  SELECT "organizationId", min(trim("manufacturer")) AS nome
  FROM "assets" WHERE "manufacturer" IS NOT NULL AND trim("manufacturer") <> ''
  GROUP BY "organizationId", lower(trim("manufacturer"))
) d;

UPDATE "assets" a SET "manufacturerId" = m."id"
FROM "manufacturers" m
WHERE m."organizationId" = a."organizationId"
  AND lower(m."name") = lower(trim(a."manufacturer"));

-- O modelo herda o fabricante e o tipo do ativo em que ele apareceu.
INSERT INTO "asset_models" ("id", "organizationId", "manufacturerId", "kind", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), d."organizationId", d."manufacturerId", d."kind", d.nome, now(), now()
FROM (
  SELECT "organizationId", "manufacturerId", min("kind") AS "kind", min(trim("model")) AS nome
  FROM "assets" WHERE "model" IS NOT NULL AND trim("model") <> ''
  GROUP BY "organizationId", "manufacturerId", lower(trim("model"))
) d;

UPDATE "assets" a SET "assetModelId" = am."id"
FROM "asset_models" am
WHERE am."organizationId" = a."organizationId"
  AND lower(am."name") = lower(trim(a."model"))
  AND am."manufacturerId" IS NOT DISTINCT FROM a."manufacturerId";

-- 3. Agora o texto pode cair.
ALTER TABLE "assets" DROP COLUMN "location",
                     DROP COLUMN "manufacturer",
                     DROP COLUMN "model";
