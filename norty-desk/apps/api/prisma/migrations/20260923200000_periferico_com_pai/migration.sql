-- Periférico é ativo, e pendura num equipamento.
--
-- As linhas que o `migrate diff` emite para as três colunas geradas
-- (articles.busca, clients.buscaNome, clients.documentoDigitos) foram
-- apagadas à mão, como manda a armadilha 2 do CLAUDE.md.

-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'PERIFERICO';

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "parentAssetId" UUID;

-- CreateIndex
CREATE INDEX "assets_parentAssetId_idx" ON "assets"("parentAssetId");

-- AddForeignKey
--
-- SET NULL: apagar a máquina não pode apagar o teclado. Ele continua
-- existindo, volta a ser avulso, e o termo assinado por quem o usa
-- continua valendo.
ALTER TABLE "assets" ADD CONSTRAINT "assets_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ninguém pendura em si mesmo. É o único pedaço do ciclo que cabe numa
-- linha; corrente mais longa o serviço recusa, ao exigir que o pai não
-- tenha pai.
ALTER TABLE "assets" ADD CONSTRAINT "assets_pai_nao_e_ele_mesmo"
  CHECK ("parentAssetId" IS NULL OR "parentAssetId" <> "id");
