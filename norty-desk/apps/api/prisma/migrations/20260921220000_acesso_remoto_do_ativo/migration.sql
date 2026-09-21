-- Como se chega na máquina: Tailscale, VPN e acesso remoto.
--
-- `remoteAccessSecret` guarda a senha **cifrada** (AES-256-GCM, ver
-- `channels/segredos.ts`). Em texto claro, um dump do banco entregaria
-- o acesso remoto do parque inteiro de uma vez.
--
-- (O lixo das três colunas geradas que o diff emite junto foi apagado à
-- mão — CLAUDE.md, armadilha 2.)

CREATE TYPE "RemoteAccessKind" AS ENUM ('ANYDESK', 'RUSTDESK', 'TEAMVIEWER', 'VNC', 'RDP', 'OUTRO');

ALTER TABLE "assets" ADD COLUMN     "remoteAccessId" TEXT,
ADD COLUMN     "remoteAccessKind" "RemoteAccessKind",
ADD COLUMN     "remoteAccessSecret" TEXT,
ADD COLUMN     "tailscaleIp" TEXT,
ADD COLUMN     "vpnNotes" TEXT;
