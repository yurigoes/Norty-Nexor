-- CreateEnum
CREATE TYPE "ComponentKind" AS ENUM ('PROCESSADOR', 'MEMORIA', 'DISCO', 'PLACA_MAE', 'PLACA_DE_REDE', 'PLACA_DE_VIDEO', 'PLACA_DE_SOM', 'CONTROLADORA', 'FONTE', 'BATERIA', 'UNIDADE_OTICA', 'FIRMWARE', 'GABINETE', 'CAMERA', 'SENSOR', 'SIMCARD', 'OUTRO');

-- CreateTable
CREATE TABLE "asset_components" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "kind" "ComponentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturerId" UUID,
    "serialNumber" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_components_assetId_kind_idx" ON "asset_components"("assetId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "asset_components_organizationId_serialNumber_key" ON "asset_components"("organizationId", "serialNumber");

-- AddForeignKey
ALTER TABLE "asset_components" ADD CONSTRAINT "asset_components_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_components" ADD CONSTRAINT "asset_components_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_components" ADD CONSTRAINT "asset_components_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

