-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('essential', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('ocupada', 'vaga', 'reformando', 'alugada');

-- CreateEnum
CREATE TYPE "ResidentType" AS ENUM ('proprietario', 'inquilino', 'dependente');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('morador', 'sindico', 'administrador', 'portaria', 'administradora');

-- CreateEnum
CREATE TYPE "CommonAreaKind" AS ENUM ('salao_festas', 'salao_gourmet', 'churrasqueira', 'academia', 'piscina', 'brinquedoteca', 'quadra', 'coworking', 'espaco_pet', 'cinema');

-- CreateEnum
CREATE TYPE "GateKind" AS ENUM ('principal', 'garagem', 'servico', 'pedestre');

-- CreateEnum
CREATE TYPE "GateStatus" AS ENUM ('online', 'offline', 'manutencao');

-- CreateEnum
CREATE TYPE "AuthorizationKind" AS ENUM ('unica', 'temporaria', 'recorrente', 'permanente');

-- CreateEnum
CREATE TYPE "VisitorStatus" AS ENUM ('aguardando', 'liberado', 'no_local', 'finalizado', 'revogado', 'expirado', 'recusado');

-- CreateEnum
CREATE TYPE "VisitorCategory" AS ENUM ('visita', 'prestador', 'entrega', 'convidado_evento');

-- CreateEnum
CREATE TYPE "StaffKind" AS ENUM ('funcionario_condominio', 'funcionario_unidade', 'prestador');

-- CreateEnum
CREATE TYPE "VehicleOwnerKind" AS ENUM ('morador', 'visitante', 'prestador', 'funcionario');

-- CreateEnum
CREATE TYPE "VehicleKind" AS ENUM ('carro', 'moto', 'utilitario', 'bicicleta');

-- CreateEnum
CREATE TYPE "AccessDirection" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "AccessSubject" AS ENUM ('morador', 'visitante', 'veiculo', 'prestador', 'funcionario', 'entrega');

-- CreateEnum
CREATE TYPE "AccessMethod" AS ENUM ('manual', 'qrcode', 'placa', 'biometria', 'tag');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('recebida', 'notificada', 'retirada', 'devolvida');

-- CreateEnum
CREATE TYPE "DeliverySize" AS ENUM ('pequena', 'media', 'grande');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('pendente', 'confirmada', 'recusada', 'cancelada', 'concluida');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('planejado', 'em_andamento', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('aberto', 'pago', 'vencido', 'cancelado');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('receita', 'despesa');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('pago', 'pendente', 'atrasado');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('aberto', 'em_andamento', 'resolvido', 'cancelado');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('baixa', 'normal', 'alta', 'urgente');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('barulho', 'danos', 'acidente', 'seguranca', 'estrutural', 'regras', 'outros');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('baixa', 'media', 'alta', 'critica');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('registrada', 'em_analise', 'notificada', 'encerrada');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('foto', 'video', 'audio');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('agendada', 'em_execucao', 'concluida', 'atrasada');

-- CreateEnum
CREATE TYPE "MaintenanceRecurrence" AS ENUM ('unica', 'mensal', 'trimestral', 'semestral', 'anual');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('normal', 'importante', 'urgente');

-- CreateEnum
CREATE TYPE "AudienceKind" AS ENUM ('todos', 'torre', 'unidade');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('convencao', 'regimento', 'atas', 'contratos', 'balancetes', 'comunicados', 'administrativo');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('pdf', 'docx', 'xlsx', 'jpg');

-- CreateEnum
CREATE TYPE "AssemblyKind" AS ENUM ('ordinaria', 'extraordinaria');

-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('agendada', 'em_votacao', 'encerrada');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('visitante_chegou', 'encomenda', 'veiculo', 'aviso', 'boleto', 'reserva', 'chamado', 'ocorrencia', 'acesso', 'autorizacao', 'assembleia', 'servico');

-- CreateEnum
CREATE TYPE "ProfessionalCategory" AS ENUM ('eletrica', 'hidraulica', 'reformas', 'limpeza', 'climatizacao', 'montagem', 'chaveiro', 'pintura', 'tecnologia', 'jardinagem', 'pet', 'aulas', 'mudancas', 'dedetizacao');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('enviado', 'respondido', 'contratado', 'concluido', 'cancelado');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "logoInitials" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'essential',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condominiums" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "zip" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "managerName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condominiums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "towers" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floors" INTEGER NOT NULL,
    "unitsPerFloor" INTEGER NOT NULL,

    CONSTRAINT "towers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "towerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "block" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "area" INTEGER NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'ocupada',
    "ownerName" TEXT NOT NULL,
    "parkingSpots" TEXT[],
    "monthlyFee" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "residents" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "type" "ResidentType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "since" DATE NOT NULL,
    "isMainContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "phone" TEXT,
    "avatarColorSeed" TEXT,
    "jobTitle" TEXT,
    "unitId" TEXT,
    "extraPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "ip" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "common_areas" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CommonAreaKind" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "deposit" DECIMAL(12,2) NOT NULL,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "slots" TEXT[],
    "rules" TEXT[],
    "openDays" INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "common_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gates" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "GateKind" NOT NULL,
    "status" "GateStatus" NOT NULL DEFAULT 'online',
    "lastOpenedAt" TIMESTAMP(3),
    "lastOpenedBy" TEXT,

    CONSTRAINT "gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cameras" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT true,
    "channel" INTEGER NOT NULL,
    "streamUrl" TEXT,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "phone" TEXT,
    "kind" "AuthorizationKind" NOT NULL,
    "status" "VisitorStatus" NOT NULL DEFAULT 'aguardando',
    "category" "VisitorCategory" NOT NULL DEFAULT 'visita',
    "expectedDate" DATE NOT NULL,
    "expectedTime" TEXT NOT NULL,
    "validUntil" DATE,
    "recurrenceDays" INTEGER[],
    "notes" TEXT,
    "vehiclePlate" TEXT,
    "companyName" TEXT,
    "eventId" TEXT,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT NOT NULL,
    "kind" "StaffKind" NOT NULL,
    "workDays" INTEGER[],
    "shiftStart" TEXT NOT NULL,
    "shiftEnd" TEXT NOT NULL,
    "accessValidUntil" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "admittedAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerKind" "VehicleOwnerKind" NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "kind" "VehicleKind" NOT NULL,
    "parkingSpot" TEXT,
    "authorized" BOOLEAN NOT NULL DEFAULT true,
    "validUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT,
    "subjectType" "AccessSubject" NOT NULL,
    "subjectId" TEXT,
    "subjectName" TEXT NOT NULL,
    "direction" "AccessDirection" NOT NULL,
    "gateId" TEXT NOT NULL,
    "plate" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredBy" TEXT NOT NULL,
    "method" "AccessMethod" NOT NULL,
    "authorized" BOOLEAN NOT NULL DEFAULT true,
    "photoUrl" TEXT,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "residentId" TEXT,
    "carrier" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "size" "DeliverySize" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'recebida',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT NOT NULL,
    "shelf" TEXT NOT NULL,
    "pickedUpAt" TIMESTAMP(3),
    "pickedUpBy" TEXT,
    "notes" TEXT,
    "requiresSignature" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "guests" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'pendente',
    "fee" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_events" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "expectedGuests" INTEGER NOT NULL,
    "areaId" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'planejado',
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "condo_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'aberto',
    "paidAt" TIMESTAMP(3),
    "barcode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'pago',
    "supplier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'aberto',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "openedBy" TEXT NOT NULL,
    "openedById" TEXT,
    "assignedTo" TEXT,
    "closedAt" TIMESTAMP(3),
    "hasAttachment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_updates" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TicketStatus",

    CONSTRAINT "ticket_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT,
    "code" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'registrada',
    "location" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "involved" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_actions" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "incident_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_attachments" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT,

    CONSTRAINT "incident_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_orders" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'agendada',
    "cost" DECIMAL(12,2) NOT NULL,
    "recurrence" "MaintenanceRecurrence" NOT NULL DEFAULT 'unica',
    "lastExecutedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'normal',
    "audienceKind" "AudienceKind" NOT NULL DEFAULT 'todos',
    "audienceIds" TEXT[],
    "audienceLabel" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "sizeKb" INTEGER NOT NULL,
    "format" "DocumentFormat" NOT NULL,
    "storageKey" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assemblies" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "AssemblyKind" NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "AssemblyStatus" NOT NULL DEFAULT 'agendada',
    "quorumRequired" INTEGER NOT NULL,
    "minutesDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assemblies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_agenda_items" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "options" TEXT[],

    CONSTRAINT "assembly_agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_votes" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "option" TEXT NOT NULL,
    "voterName" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assembly_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "UserRole",
    "unitId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "refId" TEXT,
    "actions" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" "UserRole" NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "detail" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "module" TEXT NOT NULL,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "company" TEXT,
    "category" "ProfessionalCategory" NOT NULL,
    "specialties" TEXT[],
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "bio" TEXT NOT NULL,
    "serviceArea" TEXT NOT NULL,
    "since" DATE NOT NULL,
    "jobsInCondo" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "priceFrom" DECIMAL(12,2),
    "responseTime" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "recommendedByCondo" BOOLEAN NOT NULL DEFAULT false,
    "recommendedBy" TEXT,
    "emergency" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_reviews" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "service" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "residentName" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "preferredDate" DATE,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'enviado',
    "quotedAmount" DECIMAL(12,2),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_document_key" ON "tenants"("document");

-- CreateIndex
CREATE UNIQUE INDEX "condominiums_document_key" ON "condominiums"("document");

-- CreateIndex
CREATE INDEX "condominiums_tenantId_idx" ON "condominiums"("tenantId");

-- CreateIndex
CREATE INDEX "towers_condominiumId_idx" ON "towers"("condominiumId");

-- CreateIndex
CREATE INDEX "units_condominiumId_status_idx" ON "units"("condominiumId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "units_towerId_label_key" ON "units"("towerId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "residents_userId_key" ON "residents"("userId");

-- CreateIndex
CREATE INDEX "residents_condominiumId_unitId_idx" ON "residents"("condominiumId", "unitId");

-- CreateIndex
CREATE INDEX "residents_condominiumId_name_idx" ON "residents"("condominiumId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE INDEX "memberships_condominiumId_idx" ON "memberships"("condominiumId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_condominiumId_key" ON "memberships"("userId", "condominiumId");

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_refreshHash_key" ON "device_sessions"("refreshHash");

-- CreateIndex
CREATE INDEX "device_sessions_userId_idx" ON "device_sessions"("userId");

-- CreateIndex
CREATE INDEX "device_sessions_expiresAt_idx" ON "device_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "common_areas_condominiumId_idx" ON "common_areas"("condominiumId");

-- CreateIndex
CREATE INDEX "gates_condominiumId_idx" ON "gates"("condominiumId");

-- CreateIndex
CREATE INDEX "cameras_condominiumId_idx" ON "cameras"("condominiumId");

-- CreateIndex
CREATE UNIQUE INDEX "visitors_code_key" ON "visitors"("code");

-- CreateIndex
CREATE INDEX "visitors_condominiumId_expectedDate_status_idx" ON "visitors"("condominiumId", "expectedDate", "status");

-- CreateIndex
CREATE INDEX "visitors_condominiumId_unitId_idx" ON "visitors"("condominiumId", "unitId");

-- CreateIndex
CREATE INDEX "staff_condominiumId_kind_active_idx" ON "staff"("condominiumId", "kind", "active");

-- CreateIndex
CREATE INDEX "vehicles_condominiumId_unitId_idx" ON "vehicles"("condominiumId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_condominiumId_plate_key" ON "vehicles"("condominiumId", "plate");

-- CreateIndex
CREATE INDEX "access_logs_condominiumId_at_idx" ON "access_logs"("condominiumId", "at" DESC);

-- CreateIndex
CREATE INDEX "access_logs_condominiumId_unitId_at_idx" ON "access_logs"("condominiumId", "unitId", "at" DESC);

-- CreateIndex
CREATE INDEX "access_logs_condominiumId_plate_idx" ON "access_logs"("condominiumId", "plate");

-- CreateIndex
CREATE INDEX "deliveries_condominiumId_status_idx" ON "deliveries"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "deliveries_condominiumId_unitId_status_idx" ON "deliveries"("condominiumId", "unitId", "status");

-- CreateIndex
CREATE INDEX "reservations_condominiumId_date_idx" ON "reservations"("condominiumId", "date");

-- CreateIndex
CREATE INDEX "reservations_condominiumId_unitId_idx" ON "reservations"("condominiumId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_areaId_date_slot_key" ON "reservations"("areaId", "date", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "condo_events_inviteCode_key" ON "condo_events"("inviteCode");

-- CreateIndex
CREATE INDEX "condo_events_condominiumId_date_idx" ON "condo_events"("condominiumId", "date");

-- CreateIndex
CREATE INDEX "invoices_condominiumId_status_dueDate_idx" ON "invoices"("condominiumId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_unitId_reference_key" ON "invoices"("unitId", "reference");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "ledger_entries_condominiumId_date_idx" ON "ledger_entries"("condominiumId", "date");

-- CreateIndex
CREATE INDEX "tickets_condominiumId_status_priority_idx" ON "tickets"("condominiumId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_condominiumId_code_key" ON "tickets"("condominiumId", "code");

-- CreateIndex
CREATE INDEX "ticket_updates_ticketId_at_idx" ON "ticket_updates"("ticketId", "at");

-- CreateIndex
CREATE INDEX "incidents_condominiumId_status_severity_idx" ON "incidents"("condominiumId", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_condominiumId_code_key" ON "incidents"("condominiumId", "code");

-- CreateIndex
CREATE INDEX "incident_actions_incidentId_at_idx" ON "incident_actions"("incidentId", "at");

-- CreateIndex
CREATE INDEX "incident_attachments_incidentId_idx" ON "incident_attachments"("incidentId");

-- CreateIndex
CREATE INDEX "maintenance_orders_condominiumId_status_scheduledFor_idx" ON "maintenance_orders"("condominiumId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "announcements_condominiumId_publishedAt_idx" ON "announcements"("condominiumId", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "announcement_reads_announcementId_userId_key" ON "announcement_reads"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "documents_condominiumId_category_idx" ON "documents"("condominiumId", "category");

-- CreateIndex
CREATE INDEX "assemblies_condominiumId_date_idx" ON "assemblies"("condominiumId", "date");

-- CreateIndex
CREATE INDEX "assembly_agenda_items_assemblyId_order_idx" ON "assembly_agenda_items"("assemblyId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_votes_agendaItemId_unitId_key" ON "assembly_votes"("agendaItemId", "unitId");

-- CreateIndex
CREATE INDEX "notifications_condominiumId_userId_read_idx" ON "notifications"("condominiumId", "userId", "read");

-- CreateIndex
CREATE INDEX "notifications_condominiumId_unitId_read_idx" ON "notifications"("condominiumId", "unitId", "read");

-- CreateIndex
CREATE INDEX "notifications_condominiumId_role_read_idx" ON "notifications"("condominiumId", "role", "read");

-- CreateIndex
CREATE INDEX "audit_entries_condominiumId_at_idx" ON "audit_entries"("condominiumId", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_entries_condominiumId_module_idx" ON "audit_entries"("condominiumId", "module");

-- CreateIndex
CREATE INDEX "professionals_condominiumId_category_active_idx" ON "professionals"("condominiumId", "category", "active");

-- CreateIndex
CREATE INDEX "professionals_condominiumId_recommendedByCondo_rating_idx" ON "professionals"("condominiumId", "recommendedByCondo", "rating" DESC);

-- CreateIndex
CREATE INDEX "professional_reviews_professionalId_at_idx" ON "professional_reviews"("professionalId", "at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "professional_reviews_professionalId_unitId_key" ON "professional_reviews"("professionalId", "unitId");

-- CreateIndex
CREATE INDEX "service_requests_condominiumId_unitId_createdAt_idx" ON "service_requests"("condominiumId", "unitId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "service_requests_professionalId_status_idx" ON "service_requests"("professionalId", "status");

-- AddForeignKey
ALTER TABLE "condominiums" ADD CONSTRAINT "condominiums_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "towers" ADD CONSTRAINT "towers_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "towers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_areas" ADD CONSTRAINT "common_areas_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gates" ADD CONSTRAINT "gates_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "condo_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "gates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "common_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "condo_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_events" ADD CONSTRAINT "condo_events_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_events" ADD CONSTRAINT "condo_events_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_events" ADD CONSTRAINT "condo_events_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_events" ADD CONSTRAINT "condo_events_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "common_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_updates" ADD CONSTRAINT "ticket_updates_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_agenda_items" ADD CONSTRAINT "assembly_agenda_items_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_votes" ADD CONSTRAINT "assembly_votes_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "assembly_agenda_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_reviews" ADD CONSTRAINT "professional_reviews_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_reviews" ADD CONSTRAINT "professional_reviews_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_reviews" ADD CONSTRAINT "professional_reviews_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
