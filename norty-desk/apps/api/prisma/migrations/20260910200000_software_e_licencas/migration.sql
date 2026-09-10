-- CreateEnum
CREATE TYPE "LicenseKind" AS ENUM ('PERPETUA', 'ASSINATURA', 'OEM', 'VOLUME', 'GRATUITA');

-- CreateTable
CREATE TABLE "software" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturerId" UUID,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "software_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "software_versions" (
    "id" UUID NOT NULL,
    "softwareId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "software_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "software_installations" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "installedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "software_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "software_licenses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "softwareId" UUID NOT NULL,
    "versionId" UUID,
    "name" TEXT NOT NULL,
    "kind" "LicenseKind" NOT NULL DEFAULT 'PERPETUA',
    "licenseKey" TEXT,
    "seats" INTEGER,
    "purchasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "purchaseValue" DECIMAL(12,2),
    "supplierId" UUID,
    "contractId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "software_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_assignments" (
    "id" UUID NOT NULL,
    "licenseId" UUID NOT NULL,
    "assetId" UUID,
    "userId" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "software_organizationId_name_idx" ON "software"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "software_organizationId_manufacturerId_name_key" ON "software"("organizationId", "manufacturerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "software_versions_softwareId_name_key" ON "software_versions"("softwareId", "name");

-- CreateIndex
CREATE INDEX "software_installations_versionId_idx" ON "software_installations"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "software_installations_assetId_versionId_key" ON "software_installations"("assetId", "versionId");

-- CreateIndex
CREATE INDEX "software_licenses_organizationId_expiresAt_idx" ON "software_licenses"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "software_licenses_softwareId_idx" ON "software_licenses"("softwareId");

-- CreateIndex
CREATE INDEX "license_assignments_assetId_idx" ON "license_assignments"("assetId");

-- CreateIndex
CREATE INDEX "license_assignments_userId_idx" ON "license_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "license_assignments_licenseId_assetId_key" ON "license_assignments"("licenseId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "license_assignments_licenseId_userId_key" ON "license_assignments"("licenseId", "userId");

-- AddForeignKey
ALTER TABLE "software" ADD CONSTRAINT "software_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software" ADD CONSTRAINT "software_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_versions" ADD CONSTRAINT "software_versions_softwareId_fkey" FOREIGN KEY ("softwareId") REFERENCES "software"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_installations" ADD CONSTRAINT "software_installations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_installations" ADD CONSTRAINT "software_installations_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "software_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_softwareId_fkey" FOREIGN KEY ("softwareId") REFERENCES "software"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "software_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "software_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Um assento é de um equipamento OU de uma pessoa. O Prisma não
-- expressa CHECK; sem ele, uma atribuição sem dono (ou com os dois)
-- contaria assento sem ninguém para cobrar.
ALTER TABLE "license_assignments"
  ADD CONSTRAINT "license_assignments_dono_unico_check"
  CHECK (num_nonnulls("assetId", "userId") = 1);

-- Assento negativo não existe; zero é lote esgotado de propósito.
ALTER TABLE "software_licenses"
  ADD CONSTRAINT "software_licenses_seats_check" CHECK ("seats" IS NULL OR "seats" >= 0);
