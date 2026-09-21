-- O formulário dinâmico passa a ser escolhível pelo nome.
--
-- (O diff emitiu junto o lixo das três colunas geradas — `busca`,
-- `buscaNome` e `documentoDigitos`. Apagado à mão, como manda o
-- CLAUDE.md, armadilha 2.)

-- AlterTable
ALTER TABLE "ticket_forms" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isModel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ticket_forms_organizationId_isModel_position_idx" ON "ticket_forms"("organizationId", "isModel", "position");

