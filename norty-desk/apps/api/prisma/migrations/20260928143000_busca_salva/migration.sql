-- Busca salva por pessoa.
--
-- O `glpi_savedsearches` sem a metade que lá não se usa. O filtro é
-- `jsonb` porque é gravado como o objeto que a fila entende, validado na
-- entrada pelo mesmo DTO dela: string de consulta ninguém valida, e o
-- filtro inválido só apareceria quando alguém clicasse na aba.
--
-- Duas regras, uma no banco e uma fora, e a diferença é deliberada:
--
--   `(organizationId, userId, name)` é único — duas "Minha fila" da
--   mesma pessoa deixariam a aba repetida sem saber qual apagar.
--
--   "uma padrão por pessoa" **não** é índice. Garanti-la exigiria uma
--   quinta coluna gerada, que o `migrate diff` passaria a sujar em toda
--   migração daqui para frente; e o defeito que ela evita é a fila abrir
--   numa de duas buscas da própria pessoa. Fica no serviço, numa
--   transação.

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_searches_organizationId_userId_position_idx" ON "saved_searches"("organizationId", "userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "saved_searches_organizationId_userId_name_key" ON "saved_searches"("organizationId", "userId", "name");

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

