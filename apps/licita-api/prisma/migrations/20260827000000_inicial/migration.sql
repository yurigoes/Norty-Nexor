-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PorteEmpresa" AS ENUM ('mei', 'me', 'epp', 'demais');

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('dono', 'operador');

-- CreateEnum
CREATE TYPE "TipoToken" AS ENUM ('confirmacao', 'redefinicao');

-- CreateEnum
CREATE TYPE "SituacaoParticipacao" AS ENUM ('analise', 'ganha', 'perdida', 'desistiu');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "porte" "PorteEmpresa" NOT NULL DEFAULT 'me',
    "uf" CHAR(2) NOT NULL,
    "municipio" TEXT,
    "municipioIbge" CHAR(7),
    "municipiosRegiao" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estadosAtuacao" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valorMinimo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorMaximo" DECIMAL(14,2) NOT NULL DEFAULT 80000,
    "modalidades" INTEGER[] DEFAULT ARRAY[6, 8, 12]::INTEGER[],
    "diasMinimosPreparo" INTEGER NOT NULL DEFAULT 3,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_fornecimento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "palavrasChave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "palavrasExcluidas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linhas_fornecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'dono',
    "cargo" TEXT,
    "emailConfirmadoEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLoginEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadaEm" TIMESTAMP(3),

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_email" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoToken" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licitacoes" (
    "id" TEXT NOT NULL,
    "numeroControlePncp" TEXT NOT NULL,
    "cnpjOrgao" VARCHAR(14) NOT NULL,
    "orgaoRazaoSocial" TEXT NOT NULL,
    "orgaoEsfera" CHAR(1),
    "unidadeNome" TEXT,
    "municipio" TEXT NOT NULL,
    "municipioIbge" CHAR(7),
    "uf" CHAR(2) NOT NULL,
    "ano" INTEGER NOT NULL,
    "sequencial" INTEGER NOT NULL,
    "numeroCompra" TEXT,
    "processo" TEXT,
    "objeto" TEXT NOT NULL,
    "informacaoComplementar" TEXT,
    "modalidadeCodigo" INTEGER NOT NULL,
    "modoDisputaCodigo" INTEGER NOT NULL DEFAULT 5,
    "situacaoCodigo" INTEGER NOT NULL DEFAULT 1,
    "registroDePrecos" BOOLEAN NOT NULL DEFAULT false,
    "valorEstimado" DECIMAL(14,2),
    "aberturaProposta" TIMESTAMP(3),
    "encerramentoProposta" TIMESTAMP(3),
    "publicacaoPncp" TIMESTAMP(3),
    "linkPncp" TEXT NOT NULL,
    "linkSistemaOrigem" TEXT,
    "vistaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_licitacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "unidade" TEXT NOT NULL,
    "valorUnitario" DECIMAL(14,2),

    CONSTRAINT "itens_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "motivos" JSONB NOT NULL,
    "alertas" JSONB NOT NULL,
    "linhasAtendidas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "descartadaPor" TEXT,
    "calculadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favoritos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nota" TEXT,

    CONSTRAINT "favoritos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoramentos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "termos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "municipios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modalidades" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "valorMinimo" DECIMAL(14,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "alertaEmail" BOOLEAN NOT NULL DEFAULT true,
    "ultimaVarreduraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoramentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participacoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "licitacaoId" TEXT,
    "descricao" TEXT NOT NULL,
    "orgao" TEXT NOT NULL,
    "valor" DECIMAL(14,2),
    "situacao" "SituacaoParticipacao" NOT NULL DEFAULT 'analise',
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,

    CONSTRAINT "participacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucoes_ingestao" (
    "id" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),
    "ufs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modalidades" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "consultadas" INTEGER NOT NULL DEFAULT 0,
    "novas" INTEGER NOT NULL DEFAULT 0,
    "atualizadas" INTEGER NOT NULL DEFAULT 0,
    "avaliacoes" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,

    CONSTRAINT "execucoes_ingestao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX "linhas_fornecimento_empresaId_idx" ON "linhas_fornecimento"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_empresaId_idx" ON "usuarios"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_refreshHash_key" ON "sessoes"("refreshHash");

-- CreateIndex
CREATE INDEX "sessoes_usuarioId_idx" ON "sessoes"("usuarioId");

-- CreateIndex
CREATE INDEX "sessoes_expiraEm_idx" ON "sessoes"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_email_tokenHash_key" ON "tokens_email"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_email_usuarioId_tipo_idx" ON "tokens_email"("usuarioId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "licitacoes_numeroControlePncp_key" ON "licitacoes"("numeroControlePncp");

-- CreateIndex
CREATE INDEX "licitacoes_uf_encerramentoProposta_idx" ON "licitacoes"("uf", "encerramentoProposta");

-- CreateIndex
CREATE INDEX "licitacoes_municipioIbge_idx" ON "licitacoes"("municipioIbge");

-- CreateIndex
CREATE INDEX "licitacoes_modalidadeCodigo_encerramentoProposta_idx" ON "licitacoes"("modalidadeCodigo", "encerramentoProposta");

-- CreateIndex
CREATE INDEX "licitacoes_encerramentoProposta_idx" ON "licitacoes"("encerramentoProposta");

-- CreateIndex
CREATE UNIQUE INDEX "itens_licitacao_licitacaoId_numero_key" ON "itens_licitacao"("licitacaoId", "numero");

-- CreateIndex
CREATE INDEX "avaliacoes_empresaId_nota_idx" ON "avaliacoes"("empresaId", "nota");

-- CreateIndex
CREATE INDEX "avaliacoes_empresaId_descartadaPor_idx" ON "avaliacoes"("empresaId", "descartadaPor");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_empresaId_licitacaoId_key" ON "avaliacoes"("empresaId", "licitacaoId");

-- CreateIndex
CREATE INDEX "favoritos_empresaId_idx" ON "favoritos"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "favoritos_empresaId_licitacaoId_key" ON "favoritos"("empresaId", "licitacaoId");

-- CreateIndex
CREATE INDEX "monitoramentos_empresaId_idx" ON "monitoramentos"("empresaId");

-- CreateIndex
CREATE INDEX "participacoes_empresaId_situacao_idx" ON "participacoes"("empresaId", "situacao");

-- CreateIndex
CREATE INDEX "execucoes_ingestao_iniciadaEm_idx" ON "execucoes_ingestao"("iniciadaEm");

-- AddForeignKey
ALTER TABLE "linhas_fornecimento" ADD CONSTRAINT "linhas_fornecimento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_email" ADD CONSTRAINT "tokens_email_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_licitacao" ADD CONSTRAINT "itens_licitacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favoritos" ADD CONSTRAINT "favoritos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favoritos" ADD CONSTRAINT "favoritos_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoramentos" ADD CONSTRAINT "monitoramentos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacoes" ADD CONSTRAINT "participacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

