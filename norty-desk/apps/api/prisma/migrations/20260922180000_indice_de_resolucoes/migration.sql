-- O índice de resoluções: de qual chamado a resolução saiu, e quais
-- chamados ela resolveu.
--
-- Sem as linhas de `articles.busca`, `clients.buscaNome` e
-- `clients.documentoDigitos` que o `migrate diff` emitiu: colunas
-- GERADAS que o Prisma não enxerga e tenta desfazer a cada migração
-- (CLAUDE.md, armadilha 2).

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "sourceTicketId" UUID;

-- CreateTable
CREATE TABLE "article_resolutions" (
    "articleId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "confirmedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_resolutions_pkey" PRIMARY KEY ("articleId","ticketId")
);

-- CreateIndex
CREATE INDEX "article_resolutions_ticketId_idx" ON "article_resolutions"("ticketId");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_sourceTicketId_fkey" FOREIGN KEY ("sourceTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_resolutions" ADD CONSTRAINT "article_resolutions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_resolutions" ADD CONSTRAINT "article_resolutions_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_resolutions" ADD CONSTRAINT "article_resolutions_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
