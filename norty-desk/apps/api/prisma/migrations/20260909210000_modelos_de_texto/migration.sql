-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('RESPOSTA', 'SOLUCAO', 'TAREFA');


-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "categoryId" UUID,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_organizationId_kind_isActive_idx" ON "templates"("organizationId", "kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "templates_organizationId_kind_name_key" ON "templates"("organizationId", "kind", "name");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Nota interna é conceito de resposta: modelo de solução ou de tarefa
-- marcado como interno seria uma opção que não faz nada.
ALTER TABLE "templates" ADD CONSTRAINT "templates_interno_so_em_resposta" CHECK (
  "isInternal" = false OR "kind" = 'RESPOSTA');
