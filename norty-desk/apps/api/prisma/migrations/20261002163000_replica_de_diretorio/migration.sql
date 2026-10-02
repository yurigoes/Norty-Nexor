-- Réplica de diretório: outro servidor do mesmo AD.
--
-- O `glpi_authldapreplicates`. Com dois controladores de domínio, o
-- login não deve cair porque um deles reiniciou.
--
-- Só endereço: base, conta de serviço, filtros e campos continuam na
-- fonte, porque réplica é o mesmo diretório noutro servidor. Repetir a
-- configuração daria dois lugares para mudar o `baseDn`, e o esquecido
-- viraria um login que ora acha a pessoa, ora não.

-- CreateTable
CREATE TABLE "auth_source_replicas" (
    "id" UUID NOT NULL,
    "authSourceId" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 389,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_source_replicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_source_replicas_authSourceId_position_idx" ON "auth_source_replicas"("authSourceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "auth_source_replicas_authSourceId_host_port_key" ON "auth_source_replicas"("authSourceId", "host", "port");

-- AddForeignKey
ALTER TABLE "auth_source_replicas" ADD CONSTRAINT "auth_source_replicas_authSourceId_fkey" FOREIGN KEY ("authSourceId") REFERENCES "auth_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

