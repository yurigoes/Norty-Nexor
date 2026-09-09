-- DropIndex
DROP INDEX "articles_organizationId_idx";

-- AlterTable
ALTER TABLE "article_revisions" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "articles_organizationId_isPublic_isArchived_idx" ON "articles"("organizationId", "isPublic", "isArchived");

-- CreateIndex
CREATE INDEX "articles_categoryId_idx" ON "articles"("categoryId");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- Busca da base de conhecimento
-- ---------------------------------------------------------------------
--
-- Coluna gerada em vez de índice por expressão (como o de `tickets`):
-- aqui a expressão tem peso e duas origens, e repeti-la em cada consulta
-- é como o índice deixa de ser usado sem ninguém perceber. Gerada e
-- indexada, a consulta é `busca @@ ...` e não há duas versões da mesma
-- fórmula para divergirem.
--
-- Peso A: o título, que é por onde a pessoa procura. Peso B: o corpo.
ALTER TABLE "articles" ADD COLUMN "busca" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce("body", '')), 'B')
  ) STORED;

CREATE INDEX "articles_busca" ON "articles" USING gin ("busca");

-- As palavras-chave ficam fora do vetor de propósito: `array_to_string`
-- é `stable`, não `immutable`, e o Postgres recusa a coluna gerada;
-- `array_to_tsvector` guardaria o termo cru, sem radical, e "impressora"
-- deixaria de casar com a chave "impressoras". Etiqueta é busca exata, e
-- é assim que ela entra na consulta — por sobreposição de array.
CREATE INDEX "articles_keywords" ON "articles" USING gin ("keywords");
