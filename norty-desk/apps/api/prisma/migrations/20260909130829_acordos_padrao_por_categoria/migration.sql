/*
  Warnings:

  - You are about to drop the column `defaultAgreementId` on the `categories` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_defaultAgreementId_fkey";

-- DropIndex
DROP INDEX "tickets_fila";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "defaultAgreementId";

-- CreateTable
CREATE TABLE "_AcordosPadraoDaCategoria" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_AcordosPadraoDaCategoria_AB_unique" ON "_AcordosPadraoDaCategoria"("A", "B");

-- CreateIndex
CREATE INDEX "_AcordosPadraoDaCategoria_B_index" ON "_AcordosPadraoDaCategoria"("B");

-- AddForeignKey
ALTER TABLE "_AcordosPadraoDaCategoria" ADD CONSTRAINT "_AcordosPadraoDaCategoria_A_fkey" FOREIGN KEY ("A") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AcordosPadraoDaCategoria" ADD CONSTRAINT "_AcordosPadraoDaCategoria_B_fkey" FOREIGN KEY ("B") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
