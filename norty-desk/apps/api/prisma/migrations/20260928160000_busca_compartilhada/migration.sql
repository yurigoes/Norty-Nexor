-- Busca salva compartilhada com o time e com a casa.
--
-- Duas mudanças, e a segunda é consequência da primeira.
--
-- 1. `shareKind` + `teamId`: o `is_private` do GLPI com um degrau a mais,
--    porque o Desk tem times e o GLPI não.
--
-- 2. `isDefault` sai da busca e vira `saved_search_defaults`. Assim que
--    a busca passa a ser vista por várias pessoas, "é a minha padrão"
--    vira fato de cada uma, não da busca. É o `glpi_savedsearches_users`.
--
--    E de quebra resolve o que a coluna não resolvia: a chave primária
--    `(organizationId, userId)` **é** a regra "uma padrão por pessoa",
--    agora no banco. Na migração anterior ela ficou só numa transação do
--    serviço, porque garanti-la exigiria uma quinta coluna gerada.
--
-- A ordem aqui é escrita à mão e importa: o `migrate diff` põe o
-- `DROP COLUMN "isDefault"` **antes** da tabela nova, o que jogaria fora
-- a escolha de quem já marcou uma padrão. Cria, copia, e só então derruba.

-- CreateEnum
CREATE TYPE "SavedSearchShare" AS ENUM ('PRIVADA', 'TIME', 'ORGANIZACAO');

-- AlterTable: o alcance, antes de mexer no resto
ALTER TABLE "saved_searches" ADD COLUMN     "shareKind" "SavedSearchShare" NOT NULL DEFAULT 'PRIVADA',
ADD COLUMN     "teamId" UUID;

-- CreateTable
CREATE TABLE "saved_search_defaults" (
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "savedSearchId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_search_defaults_pkey" PRIMARY KEY ("organizationId","userId")
);

-- A escolha de quem já tinha uma padrão passa para a tabela nova.
-- `DISTINCT ON` é cinto de segurança: a regra antiga vivia só no
-- serviço, então duas padrão da mesma pessoa eram possíveis no banco, e
-- a chave primária nova recusaria as duas linhas.
INSERT INTO "saved_search_defaults" ("organizationId", "userId", "savedSearchId")
SELECT DISTINCT ON ("organizationId", "userId") "organizationId", "userId", "id"
FROM "saved_searches"
WHERE "isDefault" = true
ORDER BY "organizationId", "userId", "position" ASC, "createdAt" ASC;

-- AlterTable: só agora, com o dado já mudado de lugar
ALTER TABLE "saved_searches" DROP COLUMN "isDefault";

-- CreateIndex
CREATE INDEX "saved_search_defaults_savedSearchId_idx" ON "saved_search_defaults"("savedSearchId");

-- CreateIndex
CREATE INDEX "saved_searches_organizationId_shareKind_teamId_idx" ON "saved_searches"("organizationId", "shareKind", "teamId");

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_search_defaults" ADD CONSTRAINT "saved_search_defaults_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_search_defaults" ADD CONSTRAINT "saved_search_defaults_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_search_defaults" ADD CONSTRAINT "saved_search_defaults_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Time preenchido se e só se o alcance é TIME.
--
-- O Prisma não declara `CHECK`, então esta linha é escrita à mão e o
-- `migrate diff` a ignora (CLAUDE.md, armadilha 2). Sem ela cabem duas
-- linhas sem sentido: busca de time sem time, que é uma aba que ninguém
-- sabe de quem é; e busca privada apontando para um time, que sugere um
-- compartilhamento que não existe.
ALTER TABLE "saved_searches"
  ADD CONSTRAINT "saved_searches_time_do_alcance"
  CHECK (("shareKind" = 'TIME') = ("teamId" IS NOT NULL));
