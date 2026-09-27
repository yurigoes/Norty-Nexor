-- A rede que o agente enxerga.
--
-- `managedByAgent` nos dois lugares é a mesma regra dos componentes: o
-- agente só mexe no que é dele. A porta que alguém cadastrou à mão no
-- switch e o endereço que alguém reservou para o servidor de arquivos
-- não somem porque uma varredura deixou de vê-los.
--
-- `currentIp` é instantâneo, não propriedade. Endereço de DHCP é
-- concessão e vence: guardá-lo em `ip_addresses` encheria o IPAM de
-- linhas que mentem no dia seguinte, e a próxima máquina a receber o
-- endereço colidiria com o registro da anterior. Aqui ele responde "que
-- máquina estava em 192.168.1.50" sem prometer que ainda está.
ALTER TABLE "ip_addresses" ADD COLUMN "managedByAgent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "network_ports" ADD COLUMN "managedByAgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dhcp" BOOLEAN,
ADD COLUMN "currentIp" INET,
ADD COLUMN "currentIpAt" TIMESTAMP(3);

CREATE INDEX "network_ports_organizationId_currentIp_idx" ON "network_ports"("organizationId", "currentIp");
