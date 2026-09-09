-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('COMPUTADOR', 'MONITOR', 'IMPRESSORA', 'TELEFONE', 'REDE', 'LICENCA', 'OUTRO');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('EM_USO', 'EM_ESTOQUE', 'EM_MANUTENCAO', 'BAIXADO');

-- NOTA: `prisma migrate diff --from-schema-datasource` gerou aqui um
-- `DROP INDEX articles_busca`, um `DROP INDEX articles_keywords` e um
-- `ALTER TABLE articles DROP COLUMN busca`. Ele lê o banco vivo e
-- "corrige" tudo que não está no schema.prisma — inclusive o que foi
-- escrito à mão de propósito. As três linhas foram removidas.
--
-- Daqui em diante o diff sai de `--from-migrations`, não do banco:
-- ver a nota em CLAUDE.md.

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL DEFAULT 'OUTRO',
    "status" "AssetStatus" NOT NULL DEFAULT 'EM_USO',
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "location" TEXT,
    "userId" UUID,
    "purchasedAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_assets" (
    "ticketId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_assets_pkey" PRIMARY KEY ("ticketId","assetId")
);

-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "score" INTEGER,
    "comment" TEXT,
    "answeredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_organizationId_status_idx" ON "assets"("organizationId", "status");

-- CreateIndex
CREATE INDEX "assets_userId_idx" ON "assets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organizationId_tag_key" ON "assets"("organizationId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organizationId_serialNumber_key" ON "assets"("organizationId", "serialNumber");

-- CreateIndex
CREATE INDEX "ticket_assets_assetId_idx" ON "ticket_assets"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "surveys_ticketId_key" ON "surveys"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "surveys_token_key" ON "surveys"("token");

-- CreateIndex
CREATE INDEX "surveys_organizationId_answeredAt_idx" ON "surveys"("organizationId", "answeredAt");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assets" ADD CONSTRAINT "ticket_assets_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assets" ADD CONSTRAINT "ticket_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- Regras que a aplicação não pode burlar
-- ---------------------------------------------------------------------

-- Nota de 1 a 5, e só quando respondida. Uma pesquisa com nota e sem
-- data de resposta é uma nota que ninguém deu.
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_nota" CHECK (
  ("score" IS NULL AND "answeredAt" IS NULL)
  OR ("score" BETWEEN 1 AND 5 AND "answeredAt" IS NOT NULL)
);

-- Etiqueta e série em branco não são "iguais": o @@unique do Prisma
-- deixa passar vários NULL, que é o que se quer, mas string vazia
-- colidiria. Normalizar aqui evita depender de cada chamador lembrar.
ALTER TABLE "assets" ADD CONSTRAINT "assets_identificadores" CHECK (
  ("tag" IS NULL OR length(btrim("tag")) > 0)
  AND ("serialNumber" IS NULL OR length(btrim("serialNumber")) > 0)
);

-- A busca do suporte é por etiqueta, série ou nome, e quase sempre com
-- o que a pessoa lembra pela metade.
CREATE INDEX "assets_busca" ON "assets" USING gin (
  (setweight(to_tsvector('portuguese', coalesce("name", '')), 'A') ||
   setweight(to_tsvector('portuguese', coalesce("tag", '')), 'A') ||
   setweight(to_tsvector('portuguese', coalesce("serialNumber", '')), 'A') ||
   setweight(to_tsvector('portuguese', coalesce("model", '')), 'B'))
);
