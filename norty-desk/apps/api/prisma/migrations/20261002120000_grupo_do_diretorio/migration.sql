-- Grupo do diretório virando time e papel.
--
-- O `RuleRight` do GLPI, reduzido ao que o Desk tem: um grupo do AD vira
-- time, papel, ou os dois. Lá a regra tem motor de critérios genérico;
-- aqui a pergunta é sempre a mesma — "a pessoa está neste grupo?".
--
-- As duas colunas booleanas são o que faz a **revogação** ser segura, e
-- são a mesma ideia do `managedByAgent` do inventário:
--
--   `team_members.managedByDirectory` — o diretório só tira do time quem
--   o diretório pôs. Sem a marca, sincronizar apagaria quem alguém
--   atrelou à mão; e não apagar nada faria sair do grupo no AD não tirar
--   do time, que é metade do motivo de o mapa existir.
--
--   `memberships.roleFromDirectory` — permite devolver o papel ao padrão
--   da fonte quando a pessoa sai do grupo, sem desfazer a promoção que um
--   administrador deu à mão.
--
-- Ambas nascem `false`, e isso é o comportamento certo para o que já
-- existe: ninguém entrou por mapa de grupo ainda, então nada do que está
-- lá é do diretório.

-- CreateEnum
CREATE TYPE "GroupSearch" AS ENUM ('ATRIBUTO', 'OBJETO', 'AMBOS');

-- AlterTable
ALTER TABLE "auth_sources" ADD COLUMN     "groupBaseDn" TEXT,
ADD COLUMN     "groupField" TEXT NOT NULL DEFAULT 'memberOf',
ADD COLUMN     "groupFilter" TEXT DEFAULT '(objectClass=group)',
ADD COLUMN     "groupMemberField" TEXT NOT NULL DEFAULT 'member',
ADD COLUMN     "groupNested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupSearch" "GroupSearch" NOT NULL DEFAULT 'ATRIBUTO';

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "roleFromDirectory" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "team_members" ADD COLUMN     "managedByDirectory" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "directory_group_maps" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "authSourceId" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "teamId" UUID,
    "isTeamManager" BOOLEAN NOT NULL DEFAULT false,
    "role" "Role",
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "directory_group_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "directory_group_maps_organizationId_position_idx" ON "directory_group_maps"("organizationId", "position");

-- CreateIndex
CREATE INDEX "directory_group_maps_teamId_idx" ON "directory_group_maps"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "directory_group_maps_authSourceId_group_key" ON "directory_group_maps"("authSourceId", "group");

-- AddForeignKey
ALTER TABLE "directory_group_maps" ADD CONSTRAINT "directory_group_maps_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_group_maps" ADD CONSTRAINT "directory_group_maps_authSourceId_fkey" FOREIGN KEY ("authSourceId") REFERENCES "auth_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_group_maps" ADD CONSTRAINT "directory_group_maps_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

