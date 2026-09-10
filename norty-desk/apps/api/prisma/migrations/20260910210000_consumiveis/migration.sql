-- CreateEnum
CREATE TYPE "ConsumableKind" AS ENUM ('CONSUMIVEL', 'TONER');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE');

-- CreateTable
CREATE TABLE "consumable_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "ConsumableKind" NOT NULL DEFAULT 'CONSUMIVEL',
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "manufacturerId" UUID,
    "locationId" UUID,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumable_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_item_models" (
    "itemId" UUID NOT NULL,
    "assetModelId" UUID NOT NULL,

    CONSTRAINT "consumable_item_models_pkey" PRIMARY KEY ("itemId","assetModelId")
);

-- CreateTable
CREATE TABLE "consumable_movements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "assetId" UUID,
    "userId" UUID,
    "authorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumable_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumable_items_organizationId_kind_idx" ON "consumable_items"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "consumable_items_organizationId_name_key" ON "consumable_items"("organizationId", "name");

-- CreateIndex
CREATE INDEX "consumable_item_models_assetModelId_idx" ON "consumable_item_models"("assetModelId");

-- CreateIndex
CREATE INDEX "consumable_movements_itemId_createdAt_idx" ON "consumable_movements"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "consumable_movements_assetId_idx" ON "consumable_movements"("assetId");

-- CreateIndex
CREATE INDEX "consumable_movements_organizationId_idx" ON "consumable_movements"("organizationId");

-- AddForeignKey
ALTER TABLE "consumable_items" ADD CONSTRAINT "consumable_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_items" ADD CONSTRAINT "consumable_items_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_items" ADD CONSTRAINT "consumable_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_item_models" ADD CONSTRAINT "consumable_item_models_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "consumable_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_item_models" ADD CONSTRAINT "consumable_item_models_assetModelId_fkey" FOREIGN KEY ("assetModelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "consumable_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Entrada e saída são sempre positivas; o ajuste leva o sinal e nunca é
-- zero. Sem isso, uma saída negativa "devolveria" estoque sem registro.
ALTER TABLE "consumable_movements"
  ADD CONSTRAINT "consumable_movements_quantidade_check"
  CHECK (("kind" = 'AJUSTE' AND "quantity" <> 0) OR ("kind" <> 'AJUSTE' AND "quantity" > 0));

-- Equipamento e pessoa só fazem sentido na saída.
ALTER TABLE "consumable_movements"
  ADD CONSTRAINT "consumable_movements_destino_check"
  CHECK ("kind" = 'SAIDA' OR ("assetId" IS NULL AND "userId" IS NULL));

ALTER TABLE "consumable_items"
  ADD CONSTRAINT "consumable_items_minimo_check" CHECK ("minStock" >= 0);
