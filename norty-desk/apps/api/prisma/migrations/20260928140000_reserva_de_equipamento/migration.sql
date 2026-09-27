-- Reserva de equipamento.
--
-- A regra que não pode ser burlada é "duas reservas não se sobrepõem no
-- mesmo equipamento", e ela vive no banco (CLAUDE.md, regra 4). Duas
-- requisições simultâneas passariam juntas por qualquer verificação
-- feita antes de gravar — e é exatamente assim que duas pessoas
-- reservam a mesma coisa: ao mesmo tempo, na segunda-feira de manhã.
--
-- `btree_gist` existe para o `=` de UUID conviver com o `&&` de
-- intervalo dentro do mesmo índice GiST. Sem a extensão o `EXCLUDE` não
-- aceita a coluna de igualdade.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateTable
CREATE TABLE "asset_reservations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "createdById" UUID NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "canceledReason" TEXT,
    "holdingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_reservations_holdingId_key" ON "asset_reservations"("holdingId");

-- CreateIndex
CREATE INDEX "asset_reservations_organizationId_startsAt_idx" ON "asset_reservations"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "asset_reservations_assetId_startsAt_idx" ON "asset_reservations"("assetId", "startsAt");

-- CreateIndex
CREATE INDEX "asset_reservations_userId_startsAt_idx" ON "asset_reservations"("userId", "startsAt");

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "asset_holdings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A reserva cancelada sai da restrição: senão cancelar não liberaria a
-- janela, e a única saída seria apagar a linha — junto com o registro
-- de que alguém tinha separado aquilo.
ALTER TABLE "asset_reservations"
  ADD CONSTRAINT "asset_reservations_sem_sobreposicao"
  EXCLUDE USING gist (
    "assetId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("canceledAt" IS NULL);

-- Janela invertida é engano de quem digitou, e uma reserva que termina
-- antes de começar nunca aparece em consulta nenhuma: fica no banco
-- ocupando o equipamento e invisível.
ALTER TABLE "asset_reservations"
  ADD CONSTRAINT "asset_reservations_janela" CHECK ("endsAt" > "startsAt");
