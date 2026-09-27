-- O dicionário de apelidos de fabricante.
--
-- `alias` guarda a chave já normalizada (minúsculas, sem acento, sem
-- pontuação, sem forma jurídica), nunca o texto de tela. O índice único
-- por organização é a regra e não a conveniência: dois fabricantes não
-- podem reivindicar a mesma chave, e é isso — não o `if` de quem
-- consulta antes de criar — que impede "HP" e "Hewlett-Packard" de
-- coexistirem como duas empresas.
--
-- **Não há carga de dados aqui, de propósito.** Reduzir nome a chave é
-- a função `chaveDeFabricante` de `packages/shared`, e reescrevê-la em
-- SQL daria uma segunda verdade que envelhece sozinha. O cadastro que
-- já existe é adotado na primeira consulta que o encontrar, que grava
-- os apelidos que faltavam.
CREATE TABLE "manufacturer_aliases" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manufacturer_aliases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manufacturer_aliases_manufacturerId_idx" ON "manufacturer_aliases"("manufacturerId");

CREATE UNIQUE INDEX "manufacturer_aliases_organizationId_alias_key" ON "manufacturer_aliases"("organizationId", "alias");

ALTER TABLE "manufacturer_aliases" ADD CONSTRAINT "manufacturer_aliases_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
