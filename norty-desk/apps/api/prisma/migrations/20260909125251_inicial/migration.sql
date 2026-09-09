-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SOLICITANTE', 'AGENTE', 'SUPERVISOR', 'GESTOR', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('INCIDENTE', 'REQUISICAO');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NOVO', 'ATRIBUIDO', 'PLANEJADO', 'PENDENTE', 'EM_APROVACAO', 'SOLUCIONADO', 'FECHADO');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WEB', 'EMAIL', 'WHATSAPP', 'API', 'SISTEMA');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('REQUERENTE', 'OBSERVADOR', 'ATRIBUIDO');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MENSAGEM', 'NOTA_INTERNA', 'TAREFA', 'SOLUCAO', 'APROVACAO', 'ANEXO', 'MUDANCA_STATUS', 'MUDANCA_ATRIBUICAO', 'MUDANCA_CLASSIFICACAO', 'PAUSA_SLA', 'RETOMADA_SLA', 'ENTRADA_CANAL', 'SAIDA_CANAL');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLICA', 'INTERNA');

-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('RELACIONADO', 'DUPLICADO_DE', 'BLOQUEIA');

-- CreateEnum
CREATE TYPE "AgreementKind" AS ENUM ('SLA', 'OLA');

-- CreateEnum
CREATE TYPE "TargetKind" AS ENUM ('TTO', 'TTR');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('AGUARDANDO', 'APROVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('EMAIL_IMAP', 'EMAIL_SMTP', 'EMAIL_WEBHOOK', 'WHATSAPP_EVOLUTION');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priorityMatrix" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "isManager" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "defaultTeamId" UUID,
    "defaultAgreementId" UUID,
    "defaultUrgency" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_forms" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID,
    "name" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ticket_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "TicketType" NOT NULL DEFAULT 'INCIDENTE',
    "status" "TicketStatus" NOT NULL DEFAULT 'NOVO',
    "urgency" INTEGER NOT NULL DEFAULT 3,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "categoryId" UUID,
    "formId" UUID,
    "originChannel" "Channel" NOT NULL DEFAULT 'WEB',
    "pendingReasonId" UUID,
    "pendingSince" TIMESTAMP(3),
    "pendingRemindersSent" INTEGER NOT NULL DEFAULT 0,
    "firstResponseAt" TIMESTAMP(3),
    "solvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "spentSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customFields" JSONB,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_actors" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "role" "ActorRole" NOT NULL,
    "userId" UUID,
    "teamId" UUID,
    "supplierId" UUID,
    "contactId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_actors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLICA',
    "authorId" UUID,
    "authorContactId" UUID,
    "channel" "Channel" NOT NULL DEFAULT 'WEB',
    "body" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_links" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "type" "LinkType" NOT NULL,

    CONSTRAINT "ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "eventId" UUID,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AgreementKind" NOT NULL,
    "target" "TargetKind" NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "calendarId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_levels" (
    "id" UUID NOT NULL,
    "agreementId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "offsetSeconds" INTEGER NOT NULL,
    "criteria" JSONB,
    "actions" JSONB NOT NULL,

    CONSTRAINT "escalation_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_commitments" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "agreementId" UUID NOT NULL,
    "kind" "AgreementKind" NOT NULL,
    "target" "TargetKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "achievedAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sla_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendars" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_segments" (
    "id" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "calendar_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_reasons" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "followupIntervalSeconds" INTEGER NOT NULL DEFAULT 0,
    "followupsBeforeResolution" INTEGER NOT NULL DEFAULT 0,
    "followupTemplate" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pending_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "quorum" INTEGER NOT NULL DEFAULT 1,
    "approverId" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "comment" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "authorId" UUID NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_revisions" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "ChannelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "defaultTeamId" UUID,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "channelAccountId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "rawHeaders" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" UUID,
    "processedAt" TIMESTAMP(3),
    "discardedReason" TEXT,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "ticketId" UUID,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_rules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "criteria" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "stopOnMatch" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "intake_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_webhooks" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "outbound_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhookId" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseCode" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "diff" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organizationId_name_key" ON "teams"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organizationId_email_key" ON "contacts"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organizationId_phone_key" ON "contacts"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organizationId_name_key" ON "suppliers"("organizationId", "name");

-- CreateIndex
CREATE INDEX "categories_organizationId_idx" ON "categories"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organizationId_parentId_name_key" ON "categories"("organizationId", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_forms_organizationId_name_key" ON "ticket_forms"("organizationId", "name");

-- CreateIndex
CREATE INDEX "tickets_organizationId_status_idx" ON "tickets"("organizationId", "status");

-- CreateIndex
CREATE INDEX "tickets_organizationId_priority_idx" ON "tickets"("organizationId", "priority");

-- CreateIndex
CREATE INDEX "tickets_organizationId_createdAt_idx" ON "tickets"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_organizationId_number_key" ON "tickets"("organizationId", "number");

-- CreateIndex
CREATE INDEX "ticket_actors_userId_idx" ON "ticket_actors"("userId");

-- CreateIndex
CREATE INDEX "ticket_actors_teamId_idx" ON "ticket_actors"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_actors_ticketId_role_userId_key" ON "ticket_actors"("ticketId", "role", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_actors_ticketId_role_teamId_key" ON "ticket_actors"("ticketId", "role", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_actors_ticketId_role_supplierId_key" ON "ticket_actors"("ticketId", "role", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_actors_ticketId_role_contactId_key" ON "ticket_actors"("ticketId", "role", "contactId");

-- CreateIndex
CREATE INDEX "ticket_events_ticketId_createdAt_idx" ON "ticket_events"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_links_sourceId_targetId_type_key" ON "ticket_links"("sourceId", "targetId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_ticketId_idx" ON "attachments"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_organizationId_name_kind_target_key" ON "agreements"("organizationId", "name", "kind", "target");

-- CreateIndex
CREATE UNIQUE INDEX "escalation_levels_agreementId_name_key" ON "escalation_levels"("agreementId", "name");

-- CreateIndex
CREATE INDEX "sla_commitments_dueAt_achievedAt_idx" ON "sla_commitments"("dueAt", "achievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sla_commitments_ticketId_kind_target_key" ON "sla_commitments"("ticketId", "kind", "target");

-- CreateIndex
CREATE UNIQUE INDEX "calendars_organizationId_name_key" ON "calendars"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_segments_calendarId_weekday_startMinute_key" ON "calendar_segments"("calendarId", "weekday", "startMinute");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_calendarId_date_key" ON "holidays"("calendarId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "pending_reasons_organizationId_name_key" ON "pending_reasons"("organizationId", "name");

-- CreateIndex
CREATE INDEX "approvals_approverId_status_idx" ON "approvals"("approverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_ticketId_step_approverId_key" ON "approvals"("ticketId", "step", "approverId");

-- CreateIndex
CREATE INDEX "articles_organizationId_idx" ON "articles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "article_revisions_articleId_version_key" ON "article_revisions"("articleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_organizationId_name_key" ON "channel_accounts"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_eventId_key" ON "inbound_messages"("eventId");

-- CreateIndex
CREATE INDEX "inbound_messages_processedAt_idx" ON "inbound_messages"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_organizationId_channel_externalId_key" ON "inbound_messages"("organizationId", "channel", "externalId");

-- CreateIndex
CREATE INDEX "outbound_messages_status_scheduledFor_idx" ON "outbound_messages"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "intake_rules_organizationId_position_idx" ON "intake_rules"("organizationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "intake_rules_organizationId_name_key" ON "intake_rules"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_webhooks_organizationId_name_key" ON "outbound_webhooks"("organizationId", "name");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_createdAt_idx" ON "webhook_deliveries"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_organizationId_name_key" ON "api_keys"("organizationId", "name");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_defaultTeamId_fkey" FOREIGN KEY ("defaultTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_defaultAgreementId_fkey" FOREIGN KEY ("defaultAgreementId") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_forms" ADD CONSTRAINT "ticket_forms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_forms" ADD CONSTRAINT "ticket_forms_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ticket_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_pendingReasonId_fkey" FOREIGN KEY ("pendingReasonId") REFERENCES "pending_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_actors" ADD CONSTRAINT "ticket_actors_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_actors" ADD CONSTRAINT "ticket_actors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_actors" ADD CONSTRAINT "ticket_actors_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_actors" ADD CONSTRAINT "ticket_actors_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_actors" ADD CONSTRAINT "ticket_actors_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ticket_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_levels" ADD CONSTRAINT "escalation_levels_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_commitments" ADD CONSTRAINT "sla_commitments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_commitments" ADD CONSTRAINT "sla_commitments_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_segments" ADD CONSTRAINT "calendar_segments_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_reasons" ADD CONSTRAINT "pending_reasons_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ticket_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_rules" ADD CONSTRAINT "intake_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_webhooks" ADD CONSTRAINT "outbound_webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "outbound_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- Regras que não podem ser burladas vivem no banco (CLAUDE.md, regra 4).
-- Prisma não expressa CHECK nem índice funcional: entram aqui, à mão.
-- Ver docs/09-migracao.md, seção 4.
-- =====================================================================

-- Exatamente um alvo por ator. Sem isto, um ator poderia apontar para um
-- usuário E um time ao mesmo tempo, ou para nenhum.
ALTER TABLE "ticket_actors" ADD CONSTRAINT "ticket_actors_alvo_unico" CHECK (
  ("userId" IS NOT NULL)::int + ("teamId" IS NOT NULL)::int +
  ("supplierId" IS NOT NULL)::int + ("contactId" IS NOT NULL)::int = 1
);

-- Urgência, impacto e prioridade vivem na escala de 1 a 5. A aplicação
-- valida na fronteira; o banco recusa o que passar por outro caminho.
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_escala" CHECK (
  "urgency" BETWEEN 1 AND 5 AND "impact" BETWEEN 1 AND 5 AND "priority" BETWEEN 1 AND 5
);

-- Um chamado não se relaciona consigo mesmo.
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_sem_auto" CHECK (
  "sourceId" <> "targetId"
);

-- Faixa de expediente com duração positiva, dentro do dia. Uma faixa
-- degenerada faria o cálculo de SLA varrer a agenda inteira sem avançar.
ALTER TABLE "calendar_segments" ADD CONSTRAINT "calendar_segments_ordem" CHECK (
  "startMinute" < "endMinute" AND "startMinute" >= 0 AND "endMinute" <= 1440
);
ALTER TABLE "calendar_segments" ADD CONSTRAINT "calendar_segments_dia" CHECK (
  "weekday" BETWEEN 0 AND 6
);

-- Prazo e tempo são segundos não negativos.
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_duracao" CHECK ("durationSeconds" > 0);
ALTER TABLE "sla_commitments" ADD CONSTRAINT "sla_commitments_pausa" CHECK ("pausedSeconds" >= 0);
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tempo_gasto" CHECK ("spentSeconds" >= 0);

-- Numeração de chamado começa em 1.
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_numero_positivo" CHECK ("number" > 0);

-- Quórum de aprovação é no mínimo um voto.
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_quorum" CHECK ("quorum" >= 1 AND "step" >= 1);

-- Busca textual da fila, em português: assunto e descrição juntos.
CREATE INDEX "tickets_busca" ON "tickets"
  USING gin (to_tsvector('portuguese', "subject" || ' ' || "description"));

-- A fila do agente filtra por organização e status, ordena por
-- prioridade e data. Um índice composto cobre a consulta quente.
CREATE INDEX "tickets_fila" ON "tickets" ("organizationId", "status", "priority" DESC, "createdAt");

-- O cron de escalonamento procura compromisso vencendo e não cumprido.
CREATE INDEX "sla_commitments_pendentes" ON "sla_commitments" ("dueAt")
  WHERE "achievedAt" IS NULL AND "breachedAt" IS NULL;

-- O processador de canal varre o que ainda não virou evento.
CREATE INDEX "inbound_nao_processadas" ON "inbound_messages" ("receivedAt")
  WHERE "processedAt" IS NULL;
