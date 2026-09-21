-- O tipo de chamado que aparece na abertura sem login.
--
-- `false` por padrão de propósito: a taxonomia interna tem ramo que não
-- se mostra a estranho, e um padrão que publicasse tudo faria de cada
-- categoria nova um vazamento que ninguém decidiu.
--
-- (O lixo das três colunas geradas que o diff emite junto foi apagado à
-- mão — CLAUDE.md, armadilha 2.)
ALTER TABLE "categories" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
