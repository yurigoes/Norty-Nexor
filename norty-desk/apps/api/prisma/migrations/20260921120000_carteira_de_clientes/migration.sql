-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CLIENTE';

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "clientId" UUID;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "clientId" UUID;

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "emailDomain" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_throttle" (
    "id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "ultimaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueadoAte" TIMESTAMP(3),

    CONSTRAINT "login_throttle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_organizationId_isActive_idx" ON "clients"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organizationId_name_key" ON "clients"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organizationId_emailDomain_key" ON "clients"("organizationId", "emailDomain");

-- CreateIndex
CREATE UNIQUE INDEX "login_throttle_chave_key" ON "login_throttle"("chave");

-- CreateIndex
CREATE INDEX "login_throttle_bloqueadoAte_idx" ON "login_throttle"("bloqueadoAte");

-- CreateIndex
CREATE INDEX "memberships_clientId_idx" ON "memberships"("clientId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A fila do portal do cliente: "meus chamados abertos, os recentes em
-- cima". Sem este índice ela nasce varrendo a tabela inteira de
-- chamados da organização para filtrar um cliente só — e o portal é a
-- tela que mais abre, porque cada pessoa de cada empresa abre a dela.
CREATE INDEX "tickets_cliente_fila" ON "tickets" ("clientId", "status", "createdAt" DESC);
