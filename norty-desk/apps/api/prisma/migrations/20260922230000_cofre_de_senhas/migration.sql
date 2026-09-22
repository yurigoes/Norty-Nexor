-- Cofre de senhas: o segredo, quem pode abri-lo e até quando, e o
-- registro de cada leitura.
--
-- Sem as linhas de colunas GERADAS que o `migrate diff` emitiu para
-- `articles.busca`, `clients.buscaNome` e `clients.documentoDigitos`
-- (CLAUDE.md, armadilha 2).

-- CreateEnum
CREATE TYPE "SecretKind" AS ENUM ('SITE', 'COMPUTADOR', 'SISTEMA');

-- CreateTable
CREATE TABLE "secrets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "kind" "SecretKind" NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senhaCifrada" TEXT NOT NULL,
    "sal" TEXT NOT NULL,
    "url" TEXT,
    "assetId" UUID,
    "sistema" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_grants" (
    "id" UUID NOT NULL,
    "secretId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "grantedBy" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_accesses" (
    "id" UUID NOT NULL,
    "secretId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ip" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "secrets_organizationId_idx" ON "secrets"("organizationId");

-- CreateIndex
CREATE INDEX "secrets_ownerId_idx" ON "secrets"("ownerId");

-- CreateIndex
CREATE INDEX "secret_grants_userId_idx" ON "secret_grants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "secret_grants_secretId_userId_key" ON "secret_grants"("secretId", "userId");

-- CreateIndex
CREATE INDEX "secret_accesses_secretId_readAt_idx" ON "secret_accesses"("secretId", "readAt");

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_grants" ADD CONSTRAINT "secret_grants_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_grants" ADD CONSTRAINT "secret_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_accesses" ADD CONSTRAINT "secret_accesses_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_accesses" ADD CONSTRAINT "secret_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

