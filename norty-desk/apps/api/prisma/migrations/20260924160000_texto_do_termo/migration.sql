-- O texto que a pessoa assinou.
--
-- As linhas que o `migrate diff` emite para as quatro colunas geradas
-- (articles.busca, asset_holdings.isCurrent, clients.buscaNome,
-- clients.documentoDigitos) foram apagadas à mão, como manda a
-- armadilha 2 do CLAUDE.md.

-- CreateEnum
CREATE TYPE "TermKind" AS ENUM ('COMPROMISSO', 'QUEBRA');

-- CreateTable
CREATE TABLE "asset_terms" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "holdingId" UUID NOT NULL,
    "kind" "TermKind" NOT NULL,
    "body" TEXT NOT NULL,
    "signatureKey" TEXT,
    "signedByName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "TermKind" NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "term_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_terms_organizationId_signedAt_idx" ON "asset_terms"("organizationId", "signedAt");

-- CreateIndex
CREATE INDEX "asset_terms_holdingId_idx" ON "asset_terms"("holdingId");

-- CreateIndex
CREATE UNIQUE INDEX "term_templates_organizationId_kind_key" ON "term_templates"("organizationId", "kind");

-- AddForeignKey
ALTER TABLE "asset_terms" ADD CONSTRAINT "asset_terms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_terms" ADD CONSTRAINT "asset_terms_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "asset_holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_templates" ADD CONSTRAINT "term_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- As assinaturas que já existiam viram termos, e dizem a verdade sobre
-- si mesmas: foram colhidas antes de o texto existir. Inventar aqui a
-- redação de hoje seria afirmar que alguém assinou o que não leu.
INSERT INTO "asset_terms"
       ("id", "organizationId", "holdingId", "kind", "body",
        "signatureKey", "signedByName", "signedAt", "createdAt")
SELECT gen_random_uuid(), h."organizationId", h."id", 'COMPROMISSO',
       'Assinatura colhida antes de o texto do termo existir no sistema. '
       || 'O papel correspondente, se houver, está fora do Desk.',
       h."signatureKey", COALESCE(h."signedByName", 'não informado'),
       COALESCE(h."signedAt", h."startedAt"), h."createdAt"
  FROM "asset_holdings" h
 WHERE h."signedAt" IS NOT NULL;

-- AlterTable
--
-- Por último, e só depois do INSERT acima: apagar antes levaria as
-- assinaturas junto.
ALTER TABLE "asset_holdings" DROP COLUMN "signatureKey",
DROP COLUMN "signedAt",
DROP COLUMN "signedByName";
