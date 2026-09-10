-- CreateEnum
CREATE TYPE "PortKind" AS ENUM ('ETHERNET', 'WIFI', 'FIBRA', 'OUTRA');

-- CreateEnum
CREATE TYPE "RackFace" AS ENUM ('FRENTE', 'TRAS', 'AMBAS');

-- CreateTable
CREATE TABLE "vlans" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "tag" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vlans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_networks" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cidr" INET NOT NULL,
    "gateway" INET,
    "vlanId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_ports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PortKind" NOT NULL DEFAULT 'ETHERNET',
    "mac" TEXT,
    "speedMbps" INTEGER,
    "vlanId" UUID,
    "connectedToId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_ports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_addresses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "address" INET NOT NULL,
    "networkId" UUID,
    "assetId" UUID,
    "portId" UUID,
    "fqdn" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dc_rooms" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dc_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "racks" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "roomId" UUID,
    "name" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 42,
    "position" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rack_items" (
    "id" UUID NOT NULL,
    "rackId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "positionU" INTEGER NOT NULL,
    "heightU" INTEGER NOT NULL DEFAULT 1,
    "face" "RackFace" NOT NULL DEFAULT 'FRENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rack_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vlans_organizationId_tag_key" ON "vlans"("organizationId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "ip_networks_organizationId_cidr_key" ON "ip_networks"("organizationId", "cidr");

-- CreateIndex
CREATE UNIQUE INDEX "network_ports_connectedToId_key" ON "network_ports"("connectedToId");

-- CreateIndex
CREATE UNIQUE INDEX "network_ports_assetId_name_key" ON "network_ports"("assetId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "network_ports_organizationId_mac_key" ON "network_ports"("organizationId", "mac");

-- CreateIndex
CREATE INDEX "ip_addresses_networkId_idx" ON "ip_addresses"("networkId");

-- CreateIndex
CREATE INDEX "ip_addresses_assetId_idx" ON "ip_addresses"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ip_addresses_organizationId_address_key" ON "ip_addresses"("organizationId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "dc_rooms_organizationId_name_key" ON "dc_rooms"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "racks_organizationId_name_key" ON "racks"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "rack_items_assetId_key" ON "rack_items"("assetId");

-- CreateIndex
CREATE INDEX "rack_items_rackId_idx" ON "rack_items"("rackId");

-- AddForeignKey
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_networks" ADD CONSTRAINT "ip_networks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_networks" ADD CONSTRAINT "ip_networks_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_ports" ADD CONSTRAINT "network_ports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_ports" ADD CONSTRAINT "network_ports_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_ports" ADD CONSTRAINT "network_ports_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_ports" ADD CONSTRAINT "network_ports_connectedToId_fkey" FOREIGN KEY ("connectedToId") REFERENCES "network_ports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "ip_networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_portId_fkey" FOREIGN KEY ("portId") REFERENCES "network_ports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_rooms" ADD CONSTRAINT "dc_rooms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_rooms" ADD CONSTRAINT "dc_rooms_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "dc_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_items" ADD CONSTRAINT "rack_items_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_items" ADD CONSTRAINT "rack_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 802.1Q: tag de VLAN vai de 1 a 4094.
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_tag_check" CHECK ("tag" BETWEEN 1 AND 4094);

-- Endereço é um host, sem máscara; sub-rede é o endereço de REDE (sem bits
-- de host ligados): "192.168.15.10/24" como sub-rede seria engano.
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_host_check"
  CHECK (masklen("address") = CASE family("address") WHEN 4 THEN 32 ELSE 128 END);
ALTER TABLE "ip_networks" ADD CONSTRAINT "ip_networks_rede_check"
  CHECK ("cidr" = network("cidr")::inet);
ALTER TABLE "ip_networks" ADD CONSTRAINT "ip_networks_gateway_check"
  CHECK ("gateway" IS NULL OR ("gateway" <<= "cidr" AND masklen("gateway") = CASE family("gateway") WHEN 4 THEN 32 ELSE 128 END));

ALTER TABLE "network_ports" ADD CONSTRAINT "network_ports_velocidade_check"
  CHECK ("speedMbps" IS NULL OR "speedMbps" >= 0);
-- Uma porta não se liga a si mesma.
ALTER TABLE "network_ports" ADD CONSTRAINT "network_ports_conexao_check"
  CHECK ("connectedToId" IS NULL OR "connectedToId" <> "id");

-- Rack de 1 a 60 U; equipamento cabe dentro dele (o serviço confere o topo
-- contra a altura do rack e a sobreposição).
ALTER TABLE "racks" ADD CONSTRAINT "racks_units_check" CHECK ("units" BETWEEN 1 AND 60);
ALTER TABLE "rack_items" ADD CONSTRAINT "rack_items_posicao_check"
  CHECK ("positionU" >= 1 AND "heightU" BETWEEN 1 AND 60);
