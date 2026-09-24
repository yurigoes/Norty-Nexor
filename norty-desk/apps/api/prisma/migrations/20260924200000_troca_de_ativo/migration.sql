-- Sai um equipamento, entra outro — e o chamado registra.
--
-- As linhas que o `migrate diff` emite para as quatro colunas geradas
-- (articles.busca, asset_holdings.isCurrent, clients.buscaNome,
-- clients.documentoDigitos) foram apagadas à mão, como manda a
-- armadilha 2 do CLAUDE.md.

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'TROCA_DE_ATIVO';
