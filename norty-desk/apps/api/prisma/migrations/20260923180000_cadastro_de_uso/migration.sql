-- Cadastro de uso: a pessoa existe, a credencial não.
--
-- As linhas que o `migrate diff` emite para as três colunas geradas
-- (articles.busca, clients.buscaNome, clients.documentoDigitos) foram
-- apagadas à mão, como manda a armadilha 2 do CLAUDE.md.

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- A string vazia era o "sem senha" de antes, escrita pela carteira e
-- pelo integrador. Agora que nulo existe, o vazio vira ambiguidade: dois
-- valores para o mesmo fato, e só um deles é conferido no login.
UPDATE "users" SET "passwordHash" = NULL WHERE "passwordHash" = '';
