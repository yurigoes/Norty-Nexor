-- Estêncil: o painel do equipamento.
--
-- O `Stencil` do GLPI 11, com uma diferença deliberada: lá o estêncil é
-- uma foto do painel com um retângulo desenhado por porta; aqui é uma
-- grade — tantas colunas, tantas linhas, e a numeração correndo por uma
-- delas. Painel de switch é grade, e descrever duas fileiras de doze com
-- vinte e quatro retângulos é trabalho manual para gerar o que uma conta
-- dá. O que a grade não descreve vive em `panel_zones`.
--
-- Mora no modelo, não no equipamento: trinta switches do mesmo modelo
-- têm o mesmo painel.

-- CreateEnum
CREATE TYPE "PanelFace" AS ENUM ('FRENTE', 'TRAS');

-- CreateEnum
CREATE TYPE "PanelNumbering" AS ENUM ('COLUNA', 'LINHA');

-- CreateEnum
CREATE TYPE "PanelZoneKind" AS ENUM ('PORTA', 'TOMADA', 'CONSOLE', 'ENERGIA', 'VAZIO');

-- CreateTable
CREATE TABLE "model_panels" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetModelId" UUID NOT NULL,
    "face" "PanelFace" NOT NULL DEFAULT 'FRENTE',
    "columns" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 1,
    "numbering" "PanelNumbering" NOT NULL DEFAULT 'COLUNA',
    "startAt" INTEGER NOT NULL DEFAULT 1,
    "slots" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_zones" (
    "id" UUID NOT NULL,
    "panelId" UUID NOT NULL,
    "column" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "kind" "PanelZoneKind" NOT NULL DEFAULT 'PORTA',
    "label" TEXT,
    "portNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panel_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_panels_organizationId_idx" ON "model_panels"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "model_panels_assetModelId_face_key" ON "model_panels"("assetModelId", "face");

-- CreateIndex
CREATE UNIQUE INDEX "panel_zones_panelId_column_row_key" ON "panel_zones"("panelId", "column", "row");

-- AddForeignKey
ALTER TABLE "model_panels" ADD CONSTRAINT "model_panels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_panels" ADD CONSTRAINT "model_panels_assetModelId_fkey" FOREIGN KEY ("assetModelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_zones" ADD CONSTRAINT "panel_zones_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "model_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Os limites da grade no banco, e não só no DTO: painel com zero coluna
-- não desenha nada, e posição 0 ou negativa cai fora de qualquer grade.
-- Validar só na aplicação deixaria a porta aberta para quem grava por
-- SQL — e um painel inválido não dá erro, dá desenho errado.
ALTER TABLE "model_panels" ADD CONSTRAINT "model_panels_grade_check"
  CHECK ("columns" BETWEEN 1 AND 64 AND "rows" BETWEEN 1 AND 8
         AND "startAt" >= 0 AND ("slots" IS NULL OR "slots" >= 1));

ALTER TABLE "panel_zones" ADD CONSTRAINT "panel_zones_celula_check"
  CHECK ("column" >= 1 AND "row" >= 1 AND ("portNumber" IS NULL OR "portNumber" >= 0));
