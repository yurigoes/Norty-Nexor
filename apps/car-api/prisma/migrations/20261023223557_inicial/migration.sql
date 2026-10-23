-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'SUPPORT', 'ADMIN', 'SUPER');

-- CreateEnum
CREATE TYPE "ContextKind" AS ENUM ('STAFF', 'CUSTOMER', 'PLATFORM', 'SUPPORT');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "SaasInvoiceStatus" AS ENUM ('OPEN', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "DomainKind" AS ENUM ('SUBDOMAIN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'MISCONFIGURED', 'REMOVED');

-- CreateEnum
CREATE TYPE "SupportGrantStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('FLEX', 'GASOLINE', 'ETHANOL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'CNG');

-- CreateEnum
CREATE TYPE "Transmission" AS ENUM ('MANUAL', 'AUTOMATIC', 'CVT', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "CommercialStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'RENTED', 'FOR_SALE', 'SOLD');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('RELEASED', 'IN_INSPECTION', 'IN_MAINTENANCE', 'BLOCKED', 'AWAITING_RELEASE');

-- CreateEnum
CREATE TYPE "StatusField" AS ENUM ('COMMERCIAL', 'OPERATIONAL');

-- CreateEnum
CREATE TYPE "OdometerSource" AS ENUM ('REGISTRATION', 'INSPECTION', 'CONTRACT', 'REFUEL', 'WORK_ORDER', 'MANUAL');

-- CreateEnum
CREATE TYPE "AllocationKind" AS ENUM ('RESERVATION', 'CONTRACT', 'MAINTENANCE', 'BLOCK', 'INSPECTION');

-- CreateEnum
CREATE TYPE "ExtraPricing" AS ENUM ('PER_DAY', 'FIXED');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('INTERNAL', 'PUBLIC_SITE', 'PORTAL');

-- CreateEnum
CREATE TYPE "ContractKind" AS ENUM ('PERIOD', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'CLOSED', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SIGNED_PHYSICAL', 'SIGNED_ELECTRONIC');

-- CreateEnum
CREATE TYPE "ReceivableKind" AS ENUM ('RENTAL', 'MONTHLY', 'EXTRA', 'DAMAGE', 'INFRACTION_REIMBURSEMENT', 'FEE', 'VEHICLE_SALE', 'OTHER');

-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayableKind" AS ENUM ('MAINTENANCE', 'PARTS', 'INSURANCE', 'TAX', 'FINE', 'FUEL', 'PURCHASE', 'SALE_PREPARATION', 'DOCUMENTATION', 'VEHICLE_ACQUISITION', 'OTHER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BOLETO', 'CARD', 'CASH', 'TRANSFER', 'DEPOSIT_OFFSET');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'HELD', 'PARTIALLY_USED', 'REFUND_PENDING', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DepositEntryType" AS ENUM ('RECEIPT', 'DEDUCTION', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE_IN', 'MANUAL_IN', 'RETURN_IN', 'TRANSFER_IN', 'MAINTENANCE_OUT', 'VEHICLE_OUT', 'DRIVER_OUT', 'TRANSFER_OUT', 'LOSS', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('OPEN', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceKind" AS ENUM ('PREVENTIVE', 'CORRECTIVE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'AWAITING_ESTIMATE', 'AWAITING_APPROVAL', 'AWAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderItemType" AS ENUM ('PART', 'LABOR', 'SERVICE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TireStatus" AS ENUM ('STOCK', 'INSTALLED', 'REMOVED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "TireEventType" AS ENUM ('INSTALL', 'ROTATE', 'REPAIR', 'REMOVE', 'DISCARD');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('DELIVERY', 'PERIODIC', 'DRIVER_CHANGE', 'RETURN');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'COMPLETED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ConfirmationType" AS ENUM ('SIGNATURE_DRAWN', 'ACKNOWLEDGED_IN_PERSON');

-- CreateEnum
CREATE TYPE "InspectionItemStatus" AS ENUM ('OK', 'DAMAGED', 'MISSING', 'NA');

-- CreateEnum
CREATE TYPE "InfractionAdminStatus" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'AWAITING_DRIVER_ID', 'DRIVER_INDICATED', 'APPEALING', 'GRANTED', 'DENIED', 'CANCELLED', 'FINISHED');

-- CreateEnum
CREATE TYPE "InfractionFinancialStatus" AS ENUM ('PENDING', 'BILLING', 'PAID_BY_COMPANY', 'AWAITING_REIMBURSEMENT', 'REIMBURSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('ACCIDENT', 'COLLISION', 'DAMAGE', 'THEFT', 'ROBBERY', 'GLASS', 'NATURAL_EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'INSURER_NOTIFIED', 'UNDER_REVIEW', 'REPAIRING', 'INDEMNIFIED', 'DENIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('LISTED', 'NEGOTIATING', 'SOLD', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LeadKind" AS ENUM ('QUOTE', 'CONTACT', 'MONTHLY', 'RESERVATION_REQUEST');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CONVERTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('MAINTENANCE', 'ASSISTANCE', 'VEHICLE_SWAP', 'RENEWAL', 'TERMINATION', 'DATA_CORRECTION', 'DATA_ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL', 'SUCCESS');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED_NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'PLATFORM', 'SUPPORT', 'CUSTOMER', 'SYSTEM', 'INTEGRATION', 'PUBLIC');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'VERIFIED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "passwordChangedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "contextKind" "ContextKind",
    "organizationId" UUID,
    "membershipId" UUID,
    "customerId" UUID,
    "supportGrantId" UUID,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" DECIMAL(12,2) NOT NULL,
    "maxVehicles" INTEGER,
    "maxBranches" INTEGER,
    "maxUsers" INTEGER,
    "modules" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "document" TEXT,
    "slug" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'TRIAL',
    "statusReason" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "extraModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "priceOverride" DECIMAL(12,2),
    "trialEndsAt" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "canceledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_invoices" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "competence" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "SaasInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "paidAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "kind" "DomainKind" NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "lastCheckedAt" TIMESTAMPTZ(3),
    "lastCheckError" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_grants" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "scope" TEXT[],
    "durationHours" INTEGER NOT NULL,
    "status" "SupportGrantStatus" NOT NULL DEFAULT 'REQUESTED',
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "openedById" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "fromNorty" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "inbound_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" UUID,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "inbound_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "street" TEXT,
    "number" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "turnaroundHours" INTEGER,
    "publicVisible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "templateKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "title" TEXT,
    "allBranches" BOOLEAN NOT NULL DEFAULT false,
    "approvalLimit" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_branches" (
    "membershipId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,

    CONSTRAINT "membership_branches_pkey" PRIMARY KEY ("membershipId","branchId")
);

-- CreateTable
CREATE TABLE "org_counters" (
    "organizationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "org_counters_pkey" PRIMARY KEY ("organizationId","key")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "category" TEXT,
    "description" TEXT,
    "expiresAt" DATE,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_categories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_makes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "makeId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bodyType" TEXT,
    "seats" INTEGER,
    "doors" INTEGER,
    "trunkLiters" INTEGER,
    "tankLiters" INTEGER,
    "description" TEXT,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "hotspots" JSONB NOT NULL DEFAULT '[]',
    "model3dFileId" UUID,
    "coverFileId" UUID,
    "publicVisible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_versions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "modelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "engine" TEXT,
    "fuel" "FuelType",
    "transmission" "Transmission",
    "specs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_units" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "modelId" UUID NOT NULL,
    "versionId" UUID,
    "categoryId" UUID NOT NULL,
    "internalCode" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "renavam" TEXT,
    "chassis" TEXT,
    "engineNumber" TEXT,
    "yearManufacture" INTEGER NOT NULL,
    "yearModel" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "fuel" "FuelType" NOT NULL,
    "transmission" "Transmission" NOT NULL,
    "doors" INTEGER,
    "tankCapacityLiters" INTEGER,
    "odometerKm" INTEGER NOT NULL DEFAULT 0,
    "initialOdometerKm" INTEGER,
    "acquiredAt" DATE,
    "acquisitionValue" DECIMAL(12,2),
    "marketValue" DECIMAL(12,2),
    "supplierId" UUID,
    "location" TEXT,
    "commercialStatus" "CommercialStatus" NOT NULL DEFAULT 'AVAILABLE',
    "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'RELEASED',
    "blockReason" TEXT,
    "licensingDueDate" DATE,
    "ipvaDueDate" DATE,
    "insurancePolicyId" UUID,
    "publicVisible" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "soldAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_status_changes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "field" "StatusField" NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "userId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_timeline_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "refType" TEXT,
    "refId" UUID,
    "data" JSONB,
    "actorUserId" UUID,
    "actorName" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odometer_readings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "km" INTEGER NOT NULL,
    "source" "OdometerSource" NOT NULL,
    "refId" UUID,
    "userId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odometer_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_allocations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "kind" "AllocationKind" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reservationId" UUID,
    "contractVehicleId" UUID,
    "workOrderId" UUID,
    "reason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_tables" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "branchId" UUID,
    "name" TEXT NOT NULL,
    "dailyRate" DECIMAL(12,2) NOT NULL,
    "weeklyRate" DECIMAL(12,2),
    "monthlyRate" DECIMAL(12,2),
    "includedKmPerDay" INTEGER,
    "extraKmRate" DECIMAL(12,2),
    "additionalDriverDaily" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 60,
    "depositAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "longTermMonthly" DECIMAL(12,2),
    "longTermKmPerMonth" INTEGER,
    "publicVisible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_services" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricing" "ExtraPricing" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "publicVisible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extra_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "PersonType" NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "document" TEXT NOT NULL,
    "birthDate" DATE,
    "email" TEXT,
    "phone" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "emergencyContact" JSONB,
    "preferredPayment" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "blockReason" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "anonymizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "birthDate" DATE,
    "email" TEXT,
    "phone" TEXT,
    "cnhNumber" TEXT NOT NULL,
    "cnhCategory" TEXT NOT NULL,
    "cnhExpiresAt" DATE NOT NULL,
    "cnhFirstIssueAt" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "anonymizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_links" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "returnBranchId" UUID,
    "code" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "driverId" UUID,
    "categoryId" UUID NOT NULL,
    "vehicleUnitId" UUID,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'REQUESTED',
    "source" "ReservationSource" NOT NULL DEFAULT 'INTERNAL',
    "quote" JSONB NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "depositAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "extras" JSONB NOT NULL DEFAULT '[]',
    "additionalDrivers" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "cancelReason" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmedById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_contracts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "ContractKind" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" UUID NOT NULL,
    "reservationId" UUID,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "actualStartAt" TIMESTAMPTZ(3),
    "actualEndAt" TIMESTAMPTZ(3),
    "totalAmount" DECIMAL(12,2),
    "quote" JSONB,
    "monthlyAmount" DECIMAL(12,2),
    "termMonths" INTEGER,
    "billingDay" INTEGER,
    "adjustmentIndex" TEXT,
    "nextAdjustmentAt" DATE,
    "kmAllowance" INTEGER,
    "kmAllowancePeriod" TEXT,
    "extraKmRate" DECIMAL(12,2),
    "lateFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "monthlyInterestPercent" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "depositRequired" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "includedServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "terms" TEXT,
    "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMPTZ(3),
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "closedById" UUID,
    "closeReason" TEXT,
    "finalSettlement" JSONB,
    "renewedFromId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rental_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_versions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_vehicles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3),
    "startKm" INTEGER,
    "endKm" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_drivers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3),
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_extras" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pricing" "ExtraPricing" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contract_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID,
    "contractId" UUID,
    "vehicleUnitId" UUID,
    "kind" "ReceivableKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "competence" TEXT,
    "installment" INTEGER,
    "status" "TitleStatus" NOT NULL DEFAULT 'OPEN',
    "costCenterId" UUID,
    "cancelReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "supplierId" UUID,
    "kind" "PayableKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "status" "TitleStatus" NOT NULL DEFAULT 'OPEN',
    "approval" "ApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "vehicleUnitId" UUID,
    "workOrderId" UUID,
    "purchaseOrderId" UUID,
    "infractionId" UUID,
    "claimId" UUID,
    "saleId" UUID,
    "costCenterId" UUID,
    "documentNumber" TEXT,
    "cancelReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "receivableId" UUID,
    "payableId" UUID,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "provider" TEXT,
    "providerEventId" TEXT,
    "providerChargeId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "bankReference" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMPTZ(3),
    "reconciledById" UUID,
    "notes" TEXT,
    "registeredById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_deposits" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "security_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_entries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "depositId" UUID NOT NULL,
    "type" "DepositEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod",
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "receivableId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "kinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" TEXT,
    "phone" TEXT,
    "contactName" TEXT,
    "city" TEXT,
    "state" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_categories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_products" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "description" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "brand" TEXT,
    "manufacturer" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "reference" TEXT,
    "supplierId" UUID,
    "lastCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "referencePrice" DECIMAL(12,2),
    "minStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "maxStock" DECIMAL(12,3),
    "trackLot" BOOLEAN NOT NULL DEFAULT false,
    "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("productId","locationId")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,3) NOT NULL,
    "counterpartLocationId" UUID,
    "transferGroupId" UUID,
    "vehicleUnitId" UUID,
    "driverId" UUID,
    "workOrderId" UUID,
    "purchaseOrderId" UUID,
    "reversalOfId" UUID,
    "lot" TEXT,
    "expiresAt" DATE,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "userId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedAt" DATE,
    "notes" TEXT,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "receivedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdById" UUID,
    "appliedById" UUID,
    "appliedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "countId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "systemQty" DECIMAL(12,3) NOT NULL,
    "countedQty" DECIMAL(12,3),

    CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_service_types" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "maintenance_service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "odometerKm" INTEGER,
    "serviceTypeId" UUID NOT NULL,
    "kind" "MaintenanceKind" NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(3),
    "supplierId" UUID,
    "responsibleId" UUID,
    "estimateAmount" DECIMAL(12,2),
    "approvedAmount" DECIMAL(12,2),
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "partsCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoiceNumber" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "releasedById" UUID,
    "releasedAt" TIMESTAMPTZ(3),
    "blocksVehicle" BOOLEAN NOT NULL DEFAULT true,
    "claimId" UUID,
    "maintenancePlanId" UUID,
    "cancelReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "type" "WorkOrderItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "productId" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "movementId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "userId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "serviceTypeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "intervalKm" INTEGER,
    "intervalDays" INTEGER,
    "lastDoneAt" TIMESTAMPTZ(3),
    "lastDoneKm" INTEGER,
    "alertKmBefore" INTEGER NOT NULL DEFAULT 1000,
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 15,
    "blockWhenOverdue" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tires" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT,
    "size" TEXT NOT NULL,
    "dot" TEXT,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "TireStatus" NOT NULL DEFAULT 'STOCK',
    "vehicleUnitId" UUID,
    "position" TEXT,
    "installedKm" INTEGER,
    "accumulatedKm" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "tireId" UUID NOT NULL,
    "type" "TireEventType" NOT NULL,
    "vehicleUnitId" UUID,
    "position" TEXT,
    "odometerKm" INTEGER,
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "userId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "vehicleUnitId" UUID NOT NULL,
    "contractId" UUID,
    "driverId" UUID,
    "inspectorId" UUID NOT NULL,
    "odometerKm" INTEGER,
    "fuelEighths" INTEGER,
    "notes" TEXT,
    "pendencies" TEXT,
    "confirmationType" "ConfirmationType",
    "signerName" TEXT,
    "signatureFileId" UUID,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "status" "InspectionItemStatus" NOT NULL DEFAULT 'OK',
    "notes" TEXT,

    CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_damages" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "region" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LIGHT',
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_damages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_photos" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "itemKey" TEXT,
    "region" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_infractions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID,
    "autoNumber" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "infractionCode" TEXT,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT,
    "vehicleUnitId" UUID NOT NULL,
    "driverId" UUID,
    "contractId" UUID,
    "customerId" UUID,
    "notifiedAt" DATE,
    "driverIndicationDeadline" DATE,
    "defenseDeadline" DATE,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE,
    "adminStatus" "InfractionAdminStatus" NOT NULL DEFAULT 'RECEIVED',
    "financialStatus" "InfractionFinancialStatus" NOT NULL DEFAULT 'PENDING',
    "appealProtocol" TEXT,
    "result" TEXT,
    "notes" TEXT,
    "points" INTEGER,
    "payableId" UUID,
    "receivableId" UUID,
    "driverIndicatedAt" TIMESTAMPTZ(3),
    "driverIndicatedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "traffic_infractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infraction_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "infractionId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "userId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "infraction_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "insurerId" UUID NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "coverage" TEXT,
    "deductible" DECIMAL(12,2),
    "premium" DECIMAL(12,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "contractId" UUID,
    "driverId" UUID,
    "type" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "policyId" UUID,
    "insurerClaimNumber" TEXT,
    "policeReportNumber" TEXT,
    "deductibleAmount" DECIMAL(12,2),
    "estimatedCost" DECIMAL(12,2),
    "indemnityAmount" DECIMAL(12,2),
    "responsibleId" UUID,
    "workOrderId" UUID,
    "blocksVehicle" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT NOT NULL,
    "userId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refuel_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "driverId" UUID,
    "contractId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "station" TEXT,
    "fuel" "FuelType" NOT NULL,
    "liters" DECIMAL(10,3) NOT NULL,
    "pricePerLiter" DECIMAL(10,3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "odometerKm" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod",
    "paidByCompany" BOOLEAN NOT NULL DEFAULT true,
    "receiptFileId" UUID,
    "notes" TEXT,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consumptionKmL" DECIMAL(8,2),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refuel_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_sales" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleUnitId" UUID NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'LISTED',
    "appraisalValue" DECIMAL(12,2),
    "askingPrice" DECIMAL(12,2) NOT NULL,
    "minimumPrice" DECIMAL(12,2),
    "listedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "soldAt" TIMESTAMPTZ(3),
    "salePrice" DECIMAL(12,2),
    "buyerName" TEXT,
    "buyerDocument" TEXT,
    "receivableId" UUID,
    "bookValueAtSale" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_proposals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_configs" (
    "organizationId" UUID NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "brandName" TEXT NOT NULL,
    "logoFileId" UUID,
    "bannerFileId" UUID,
    "primaryColor" TEXT NOT NULL DEFAULT '#1677FF',
    "accentColor" TEXT NOT NULL DEFAULT '#20C5A0',
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "about" TEXT,
    "faq" JSONB NOT NULL DEFAULT '[]',
    "terms" TEXT,
    "privacy" TEXT,
    "whatsapp" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "citiesServed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featuredModelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_configs_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID,
    "kind" "LeadKind" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "categoryId" UUID,
    "modelId" UUID,
    "startAt" TIMESTAMPTZ(3),
    "endAt" TIMESTAMPTZ(3),
    "quote" JSONB,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "reservationId" UUID,
    "handledById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "contractId" UUID,
    "type" "ServiceRequestType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_request_messages" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "authorUserId" UUID,
    "fromCustomer" BOOLEAN NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_request_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID,
    "userId" UUID,
    "customerId" UUID,
    "audiencePermission" TEXT,
    "type" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "notificationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" UUID,
    "branchId" UUID,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" UUID,
    "actorName" TEXT,
    "supportGrantId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_configs" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "provider" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretEnc" TEXT,
    "lastTestAt" TIMESTAMPTZ(3),
    "lastTestResult" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secretEnc" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" INTEGER,
    "lastDeliveryAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshHash_key" ON "sessions"("refreshHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_document_key" ON "organizations"("document");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "saas_invoices_organizationId_competence_key" ON "saas_invoices"("organizationId", "competence");

-- CreateIndex
CREATE UNIQUE INDEX "domains_hostname_key" ON "domains"("hostname");

-- CreateIndex
CREATE INDEX "domains_organizationId_idx" ON "domains"("organizationId");

-- CreateIndex
CREATE INDEX "support_access_grants_organizationId_status_idx" ON "support_access_grants"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_webhook_events_provider_eventId_key" ON "inbound_webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organizationId_code_key" ON "branches"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organizationId_key_key" ON "roles"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "files_storageKey_key" ON "files"("storageKey");

-- CreateIndex
CREATE INDEX "files_organizationId_entityType_entityId_idx" ON "files"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_categories_organizationId_code_key" ON "vehicle_categories"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_makes_organizationId_name_key" ON "vehicle_makes"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_organizationId_makeId_name_key" ON "vehicle_models"("organizationId", "makeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_versions_modelId_name_key" ON "vehicle_versions"("modelId", "name");

-- CreateIndex
CREATE INDEX "vehicle_units_organizationId_branchId_idx" ON "vehicle_units"("organizationId", "branchId");

-- CreateIndex
CREATE INDEX "vehicle_units_organizationId_commercialStatus_operationalSt_idx" ON "vehicle_units"("organizationId", "commercialStatus", "operationalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_units_organizationId_plate_key" ON "vehicle_units"("organizationId", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_units_organizationId_internalCode_key" ON "vehicle_units"("organizationId", "internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_units_organizationId_renavam_key" ON "vehicle_units"("organizationId", "renavam");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_units_organizationId_chassis_key" ON "vehicle_units"("organizationId", "chassis");

-- CreateIndex
CREATE INDEX "vehicle_status_changes_vehicleUnitId_at_idx" ON "vehicle_status_changes"("vehicleUnitId", "at");

-- CreateIndex
CREATE INDEX "vehicle_timeline_events_vehicleUnitId_at_idx" ON "vehicle_timeline_events"("vehicleUnitId", "at");

-- CreateIndex
CREATE INDEX "odometer_readings_vehicleUnitId_at_idx" ON "odometer_readings"("vehicleUnitId", "at");

-- CreateIndex
CREATE INDEX "vehicle_allocations_vehicleUnitId_startsAt_idx" ON "vehicle_allocations"("vehicleUnitId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_tables_organizationId_categoryId_branchId_key" ON "rate_tables"("organizationId", "categoryId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "extra_services_organizationId_name_key" ON "extra_services"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organizationId_document_key" ON "customers"("organizationId", "document");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_organizationId_cpf_key" ON "drivers"("organizationId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "customer_links_userId_customerId_key" ON "customer_links"("userId", "customerId");

-- CreateIndex
CREATE INDEX "reservations_organizationId_status_startAt_idx" ON "reservations"("organizationId", "status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_organizationId_code_key" ON "reservations"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_reservationId_key" ON "rental_contracts"("reservationId");

-- CreateIndex
CREATE INDEX "rental_contracts_organizationId_status_idx" ON "rental_contracts"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_organizationId_number_key" ON "rental_contracts"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "contract_versions_contractId_version_key" ON "contract_versions"("contractId", "version");

-- CreateIndex
CREATE INDEX "contract_vehicles_contractId_idx" ON "contract_vehicles"("contractId");

-- CreateIndex
CREATE INDEX "contract_vehicles_vehicleUnitId_idx" ON "contract_vehicles"("vehicleUnitId");

-- CreateIndex
CREATE INDEX "contract_drivers_contractId_idx" ON "contract_drivers"("contractId");

-- CreateIndex
CREATE INDEX "contract_drivers_driverId_idx" ON "contract_drivers"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_organizationId_code_key" ON "cost_centers"("organizationId", "code");

-- CreateIndex
CREATE INDEX "receivables_organizationId_status_dueDate_idx" ON "receivables"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_contractId_kind_competence_key" ON "receivables"("contractId", "kind", "competence");

-- CreateIndex
CREATE INDEX "payables_organizationId_status_dueDate_idx" ON "payables"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "payables_vehicleUnitId_idx" ON "payables"("vehicleUnitId");

-- CreateIndex
CREATE INDEX "payments_organizationId_paidAt_idx" ON "payments"("organizationId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organizationId_idempotencyKey_key" ON "payments"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_providerEventId_key" ON "payments"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "security_deposits_contractId_key" ON "security_deposits"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_entries_organizationId_idempotencyKey_key" ON "deposit_entries"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organizationId_document_key" ON "suppliers"("organizationId", "document");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_categories_organizationId_name_key" ON "inventory_categories"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_products_organizationId_sku_key" ON "inventory_products"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_products_organizationId_barcode_key" ON "inventory_products"("organizationId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_locations_organizationId_branchId_name_key" ON "inventory_locations"("organizationId", "branchId", "name");

-- CreateIndex
CREATE INDEX "inventory_movements_organizationId_productId_at_idx" ON "inventory_movements"("organizationId", "productId", "at");

-- CreateIndex
CREATE INDEX "inventory_movements_vehicleUnitId_idx" ON "inventory_movements"("vehicleUnitId");

-- CreateIndex
CREATE INDEX "inventory_movements_workOrderId_idx" ON "inventory_movements"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_organizationId_idempotencyKey_key" ON "inventory_movements"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organizationId_number_key" ON "purchase_orders"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_items_countId_productId_key" ON "inventory_count_items"("countId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_service_types_organizationId_name_key" ON "maintenance_service_types"("organizationId", "name");

-- CreateIndex
CREATE INDEX "work_orders_organizationId_status_idx" ON "work_orders"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_organizationId_number_key" ON "work_orders"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_items_movementId_key" ON "work_order_items"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "tires_organizationId_code_key" ON "tires"("organizationId", "code");

-- CreateIndex
CREATE INDEX "inspections_vehicleUnitId_startedAt_idx" ON "inspections"("vehicleUnitId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_organizationId_number_key" ON "inspections"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_items_inspectionId_key_key" ON "inspection_items"("inspectionId", "key");

-- CreateIndex
CREATE INDEX "traffic_infractions_organizationId_adminStatus_idx" ON "traffic_infractions"("organizationId", "adminStatus");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_infractions_organizationId_authority_autoNumber_key" ON "traffic_infractions"("organizationId", "authority", "autoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_policies_organizationId_insurerId_policyNumber_key" ON "insurance_policies"("organizationId", "insurerId", "policyNumber");

-- CreateIndex
CREATE UNIQUE INDEX "claims_organizationId_number_key" ON "claims"("organizationId", "number");

-- CreateIndex
CREATE INDEX "refuel_records_vehicleUnitId_at_idx" ON "refuel_records"("vehicleUnitId", "at");

-- CreateIndex
CREATE INDEX "vehicle_sales_organizationId_status_idx" ON "vehicle_sales"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leads_organizationId_status_idx" ON "leads"("organizationId", "status");

-- CreateIndex
CREATE INDEX "service_requests_organizationId_status_idx" ON "service_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "notifications_organizationId_createdAt_idx" ON "notifications"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organizationId_dedupeKey_key" ON "notifications"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_nextAttemptAt_idx" ON "notification_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notificationId_channel_target_key" ON "notification_deliveries"("notificationId", "channel", "target");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_at_idx" ON "audit_logs"("organizationId", "at");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_organizationId_provider_key" ON "integration_configs"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_counters" ADD CONSTRAINT "org_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_categories" ADD CONSTRAINT "vehicle_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_makes" ADD CONSTRAINT "vehicle_makes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "vehicle_makes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_versions" ADD CONSTRAINT "vehicle_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_versions" ADD CONSTRAINT "vehicle_versions_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "vehicle_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_insurancePolicyId_fkey" FOREIGN KEY ("insurancePolicyId") REFERENCES "insurance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_changes" ADD CONSTRAINT "vehicle_status_changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_changes" ADD CONSTRAINT "vehicle_status_changes_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_timeline_events" ADD CONSTRAINT "vehicle_timeline_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_timeline_events" ADD CONSTRAINT "vehicle_timeline_events_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_tables" ADD CONSTRAINT "rate_tables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_tables" ADD CONSTRAINT "rate_tables_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_services" ADD CONSTRAINT "extra_services_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_links" ADD CONSTRAINT "customer_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_links" ADD CONSTRAINT "customer_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_links" ADD CONSTRAINT "customer_links_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_vehicles" ADD CONSTRAINT "contract_vehicles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_vehicles" ADD CONSTRAINT "contract_vehicles_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_vehicles" ADD CONSTRAINT "contract_vehicles_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_drivers" ADD CONSTRAINT "contract_drivers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_drivers" ADD CONSTRAINT "contract_drivers_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_drivers" ADD CONSTRAINT "contract_drivers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_extras" ADD CONSTRAINT "contract_extras_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_extras" ADD CONSTRAINT "contract_extras_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "security_deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inventory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_countId_fkey" FOREIGN KEY ("countId") REFERENCES "inventory_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_service_types" ADD CONSTRAINT "maintenance_service_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "maintenance_service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "maintenance_service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tires" ADD CONSTRAINT "tires_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tires" ADD CONSTRAINT "tires_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_events" ADD CONSTRAINT "tire_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_events" ADD CONSTRAINT "tire_events_tireId_fkey" FOREIGN KEY ("tireId") REFERENCES "tires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_damages" ADD CONSTRAINT "inspection_damages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_damages" ADD CONSTRAINT "inspection_damages_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_infractions" ADD CONSTRAINT "traffic_infractions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_infractions" ADD CONSTRAINT "traffic_infractions_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_infractions" ADD CONSTRAINT "traffic_infractions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_infractions" ADD CONSTRAINT "traffic_infractions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_infractions" ADD CONSTRAINT "traffic_infractions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infraction_events" ADD CONSTRAINT "infraction_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infraction_events" ADD CONSTRAINT "infraction_events_infractionId_fkey" FOREIGN KEY ("infractionId") REFERENCES "traffic_infractions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refuel_records" ADD CONSTRAINT "refuel_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refuel_records" ADD CONSTRAINT "refuel_records_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refuel_records" ADD CONSTRAINT "refuel_records_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_sales" ADD CONSTRAINT "vehicle_sales_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_sales" ADD CONSTRAINT "vehicle_sales_vehicleUnitId_fkey" FOREIGN KEY ("vehicleUnitId") REFERENCES "vehicle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_proposals" ADD CONSTRAINT "sale_proposals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_proposals" ADD CONSTRAINT "sale_proposals_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "vehicle_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_configs" ADD CONSTRAINT "site_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_messages" ADD CONSTRAINT "service_request_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_messages" ADD CONSTRAINT "service_request_messages_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
