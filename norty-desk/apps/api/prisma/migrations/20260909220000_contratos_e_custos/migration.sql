-- Contratos, orçamento e custo do chamado.
--
-- (O `ALTER COLUMN "busca" DROP DEFAULT` de `articles` foi removido:
-- a coluna é GENERATED e o Postgres recusa. CLAUDE.md, armadilha 2.)
-- CreateEnum
CREATE TYPE "ContractKind" AS ENUM ('SUPORTE', 'LICENCA', 'LOCACAO', 'MANUTENCAO', 'SERVICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO');

-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('TEMPO', 'MATERIAL', 'FIXO');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "amortizationMonths" INTEGER,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "purchaseValue" DECIMAL(12,2),
ADD COLUMN     "supplierId" UUID;

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ContractKind" NOT NULL DEFAULT 'SERVICO',
    "supplierId" UUID,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "noticeDays" INTEGER NOT NULL DEFAULT 30,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MENSAL',
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_assets" (
    "contractId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_assets_pkey" PRIMARY KEY ("contractId","assetId")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_costs" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "kind" "CostKind" NOT NULL DEFAULT 'MATERIAL',
    "label" TEXT NOT NULL,
    "hours" DECIMAL(8,2),
    "hourlyRate" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "budgetId" UUID,
    "authorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_organizationId_endsAt_idx" ON "contracts"("organizationId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_organizationId_number_key" ON "contracts"("organizationId", "number");

-- CreateIndex
CREATE INDEX "contract_assets_assetId_idx" ON "contract_assets"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_organizationId_name_key" ON "budgets"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ticket_costs_ticketId_idx" ON "ticket_costs"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_costs_budgetId_idx" ON "ticket_costs"("budgetId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assets" ADD CONSTRAINT "contract_assets_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assets" ADD CONSTRAINT "contract_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_costs" ADD CONSTRAINT "ticket_costs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_costs" ADD CONSTRAINT "ticket_costs_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_costs" ADD CONSTRAINT "ticket_costs_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vigência que termina antes de começar nunca vale, e um contrato assim
-- some da consulta de vencimento sem ninguém reparar.
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vigencia" CHECK (
  "endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_aviso" CHECK ("noticeDays" >= 0);
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_valor" CHECK ("value" >= 0);

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_vigencia" CHECK ("endsAt" > "startsAt");
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_valor" CHECK ("value" >= 0);

-- Custo negativo é estorno, e estorno é outra conversa: aceitar aqui
-- faria o total do chamado poder diminuir sem que nada explicasse.
ALTER TABLE "ticket_costs" ADD CONSTRAINT "ticket_costs_valor" CHECK ("amount" >= 0);

-- Linha de TEMPO precisa de horas e valor-hora; as outras não os têm.
-- Sem isto, "2 horas" sem valor-hora entraria como custo zero.
ALTER TABLE "ticket_costs" ADD CONSTRAINT "ticket_costs_tempo" CHECK (
  ("kind" = 'TEMPO' AND "hours" IS NOT NULL AND "hourlyRate" IS NOT NULL)
  OR ("kind" <> 'TEMPO' AND "hours" IS NULL AND "hourlyRate" IS NULL));

ALTER TABLE "assets" ADD CONSTRAINT "assets_valor" CHECK (
  "purchaseValue" IS NULL OR "purchaseValue" >= 0);
ALTER TABLE "assets" ADD CONSTRAINT "assets_amortizacao" CHECK (
  "amortizationMonths" IS NULL OR "amortizationMonths" >= 0);
