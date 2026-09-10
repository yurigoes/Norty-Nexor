-- Identidade por organização (decisões do Yuri, 10/09/2026): e-mail
-- opcional, nome de usuário único por organização, e a pessoa marcada com
-- o diretório (LDAP) que a autentica.
--
-- Escrita à mão a partir do `prisma migrate diff`. O diff apagava
-- users.username antes de existir memberships.username, e o valor se
-- perderia: aqui a coluna nova nasce, recebe o valor, e só depois a
-- antiga sai.

-- CreateEnum
CREATE TYPE "AuthSourceKind" AS ENUM ('LDAP');

-- CreateEnum
CREATE TYPE "LdapSecurity" AS ENUM ('NONE', 'STARTTLS', 'LDAPS');

-- AlterTable: e-mail opcional e origem da autenticação
ALTER TABLE "users" ADD COLUMN     "authSourceId" UUID,
ADD COLUMN     "externalId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable: o nome de usuário passa da pessoa para o vínculo
ALTER TABLE "memberships" ADD COLUMN     "username" TEXT;

UPDATE "memberships" AS m
SET "username" = u."username"
FROM "users" AS u
WHERE u."id" = m."userId" AND u."username" IS NOT NULL;

-- DropIndex
DROP INDEX "users_username_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "username";

-- CreateTable
CREATE TABLE "auth_sources" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AuthSourceKind" NOT NULL DEFAULT 'LDAP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 389,
    "security" "LdapSecurity" NOT NULL DEFAULT 'STARTTLS',
    "baseDn" TEXT NOT NULL,
    "bindDn" TEXT,
    "bindPassword" TEXT,
    "loginField" TEXT NOT NULL DEFAULT 'sAMAccountName',
    "syncField" TEXT NOT NULL DEFAULT 'objectGUID',
    "userFilter" TEXT,
    "emailField" TEXT NOT NULL DEFAULT 'mail',
    "nameField" TEXT NOT NULL DEFAULT 'displayName',
    "phoneField" TEXT DEFAULT 'telephoneNumber',
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "autoCreate" BOOLEAN NOT NULL DEFAULT true,
    "defaultRole" "Role" NOT NULL DEFAULT 'SOLICITANTE',
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_sources_organizationId_idx" ON "auth_sources"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sources_organizationId_name_key" ON "auth_sources"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_authSourceId_externalId_key" ON "users"("authSourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_username_key" ON "memberships"("organizationId", "username");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_authSourceId_fkey" FOREIGN KEY ("authSourceId") REFERENCES "auth_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sources" ADD CONSTRAINT "auth_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

