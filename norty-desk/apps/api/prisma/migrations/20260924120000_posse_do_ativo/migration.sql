-- Quem está com o equipamento, e quem esteve antes.
--
-- As linhas que o `migrate diff` emite para as três colunas geradas
-- (articles.busca, clients.buscaNome, clients.documentoDigitos) foram
-- apagadas à mão, como manda a armadilha 2 do CLAUDE.md. Esta migração
-- cria a **quarta**: `asset_holdings.isCurrent`.

-- CreateTable
CREATE TABLE "asset_holdings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "returnedTo" "AssetStatus",
    "notes" TEXT,
    "signatureKey" TEXT,
    "signedByName" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Gerada, e não escrita pela aplicação: `true` enquanto a posse
    -- está aberta, NULL depois. É o que faz o índice único abaixo
    -- aceitar quantas posses encerradas quiserem — NULL não colide com
    -- NULL — e recusar a segunda aberta.
    "isCurrent" boolean GENERATED ALWAYS AS (CASE WHEN "endedAt" IS NULL THEN true END) STORED,

    CONSTRAINT "asset_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_holdings_organizationId_userId_idx" ON "asset_holdings"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "asset_holdings_assetId_startedAt_idx" ON "asset_holdings"("assetId", "startedAt");

-- Uma posse aberta por ativo, e a regra mora aqui.
--
-- Duas entregas simultâneas do mesmo teclado passariam juntas por
-- qualquer validação na aplicação: as duas leem "está livre" antes de
-- qualquer uma gravar. O índice recusa a segunda.
CREATE UNIQUE INDEX "asset_holdings_assetId_isCurrent_key" ON "asset_holdings"("assetId", "isCurrent");

-- AddForeignKey
ALTER TABLE "asset_holdings" ADD CONSTRAINT "asset_holdings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_holdings" ADD CONSTRAINT "asset_holdings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT: apagar a pessoa não pode apagar a prova de quem estava com
-- o equipamento. O caminho normal de saída é `isActive: false`.
ALTER TABLE "asset_holdings" ADD CONSTRAINT "asset_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Os ativos que já têm dono viram posse aberta, sem termo assinado.
--
-- Sem isto o histórico nasceria vazio e a primeira devolução não teria o
-- que encerrar: o parque inteiro pareceria nunca ter saído do estoque.
INSERT INTO "asset_holdings" ("id", "organizationId", "assetId", "userId", "startedAt", "notes")
SELECT gen_random_uuid(), a."organizationId", a."id", a."userId", a."createdAt",
       'Posse aberta na migração, a partir de quem já constava no ativo. Sem termo assinado.'
  FROM "assets" a
 WHERE a."userId" IS NOT NULL;
