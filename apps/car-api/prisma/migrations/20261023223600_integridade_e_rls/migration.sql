-- =========================================================
--  Norty Car — integridade, imutabilidade e isolamento
-- ---------------------------------------------------------
--  O Prisma não expressa estas regras no schema, então elas
--  moram aqui. São a última linha de defesa: valem mesmo que
--  um service esqueça uma validação ou duas requisições
--  cheguem no mesmo milissegundo.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------
--  1. Motor de disponibilidade
--  Dois blocos ativos do mesmo carro não podem se sobrepor,
--  contando o tempo de preparo. Intervalo semiaberto [início, fim).
-- ---------------------------------------------------------
ALTER TABLE "vehicle_allocations"
  ADD CONSTRAINT "vehicle_allocations_period_chk"
    CHECK ("endsAt" > "startsAt" AND "blockedUntil" >= "endsAt"),
  ADD CONSTRAINT "vehicle_allocations_no_overlap"
    EXCLUDE USING gist (
      "vehicleUnitId" WITH =,
      tstzrange("startsAt", "blockedUntil", '[)') WITH &&
    ) WHERE ("active");

-- Um intervalo aberto de veículo e um motorista principal por contrato.
CREATE UNIQUE INDEX "contract_vehicles_one_open"
  ON "contract_vehicles" ("contractId") WHERE "endAt" IS NULL;
CREATE UNIQUE INDEX "contract_drivers_one_primary_open"
  ON "contract_drivers" ("contractId") WHERE "endAt" IS NULL AND "primary";
ALTER TABLE "contract_vehicles"
  ADD CONSTRAINT "contract_vehicles_period_chk" CHECK ("endAt" IS NULL OR "endAt" >= "startAt");
ALTER TABLE "contract_drivers"
  ADD CONSTRAINT "contract_drivers_period_chk" CHECK ("endAt" IS NULL OR "endAt" >= "startAt");

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_period_chk" CHECK ("endAt" > "startAt"),
  ADD CONSTRAINT "reservations_total_chk" CHECK ("total" >= 0);
ALTER TABLE "rental_contracts"
  ADD CONSTRAINT "rental_contracts_period_chk" CHECK ("endAt" > "startAt"),
  ADD CONSTRAINT "rental_contracts_billing_day_chk" CHECK ("billingDay" IS NULL OR "billingDay" BETWEEN 1 AND 28);

-- ---------------------------------------------------------
--  2. Frota
-- ---------------------------------------------------------
ALTER TABLE "vehicle_units"
  ADD CONSTRAINT "vehicle_units_odometer_chk" CHECK ("odometerKm" >= 0),
  ADD CONSTRAINT "vehicle_units_year_chk"
    CHECK ("yearModel" BETWEEN "yearManufacture" AND "yearManufacture" + 1);

CREATE UNIQUE INDEX "tires_one_per_position"
  ON "tires" ("vehicleUnitId", "position") WHERE "status" = 'INSTALLED';
CREATE UNIQUE INDEX "vehicle_sales_one_open"
  ON "vehicle_sales" ("vehicleUnitId") WHERE "status" IN ('LISTED', 'NEGOTIATING');

-- ---------------------------------------------------------
--  3. Financeiro e estoque
-- ---------------------------------------------------------
ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_amount_chk" CHECK ("amount" > 0 AND "paidAmount" >= 0);
ALTER TABLE "payables"
  ADD CONSTRAINT "payables_amount_chk" CHECK ("amount" > 0 AND "paidAmount" >= 0);
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_target_chk" CHECK (("receivableId" IS NULL) <> ("payableId" IS NULL));
ALTER TABLE "deposit_entries"
  ADD CONSTRAINT "deposit_entries_amount_chk" CHECK ("amount" > 0 OR "type" = 'ADJUSTMENT');
ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_quantity_chk" CHECK ("quantity" <> 0);
ALTER TABLE "refuel_records"
  ADD CONSTRAINT "refuel_records_values_chk" CHECK ("liters" > 0 AND "pricePerLiter" > 0 AND "total" > 0);
ALTER TABLE "inspections"
  ADD CONSTRAINT "inspections_fuel_chk" CHECK ("fuelEighths" IS NULL OR "fuelEighths" BETWEEN 0 AND 8);

-- ---------------------------------------------------------
--  4. Registros imutáveis
--  Histórico, auditoria e movimentações não se editam: erro se
--  corrige com um novo registro (estorno, adendo, nova versão).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION nc_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutável: % não é permitido em %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_logs', 'vehicle_timeline_events', 'vehicle_status_changes', 'inventory_movements',
    'contract_versions', 'infraction_events', 'work_order_events', 'claim_events',
    'odometer_readings', 'tire_events'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nc_forbid_change()',
      t || '_immutable', t);
  END LOOP;
END $$;

-- Títulos, pagamentos e arquivos nunca são apagados: cancela-se, estorna-se
-- ou marca-se como excluído logicamente.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'receivables', 'payables', 'payments', 'deposit_entries', 'files', 'rental_contracts',
    'reservations', 'inspections', 'traffic_infractions', 'claims', 'vehicle_units', 'customers'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nc_forbid_change()',
      t || '_no_delete', t);
  END LOOP;
END $$;

-- Pagamento: valor, sentido e título de destino são fixos depois de gravados.
CREATE OR REPLACE FUNCTION nc_payment_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."amount" <> OLD."amount" OR NEW."direction" <> OLD."direction"
     OR NEW."receivableId" IS DISTINCT FROM OLD."receivableId"
     OR NEW."payableId" IS DISTINCT FROM OLD."payableId"
     OR NEW."idempotencyKey" <> OLD."idempotencyKey" THEN
    RAISE EXCEPTION 'Pagamento registrado não pode ter valor ou destino alterado; registre um estorno.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "payments_guard" BEFORE UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION nc_payment_guard();

-- Movimento de caução: só a decisão de aprovação pode mudar, e só uma vez.
CREATE OR REPLACE FUNCTION nc_deposit_entry_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'PENDING_APPROVAL'
     OR NEW."amount" <> OLD."amount" OR NEW."type" <> OLD."type"
     OR NEW."depositId" <> OLD."depositId" THEN
    RAISE EXCEPTION 'Movimento de caução já decidido não pode ser alterado.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "deposit_entries_guard" BEFORE UPDATE ON "deposit_entries"
  FOR EACH ROW EXECUTE FUNCTION nc_deposit_entry_guard();

-- Vistoria concluída: evidências congeladas. Depois de concluir, só a
-- aprovação e a liberação ao cliente podem mudar.
CREATE OR REPLACE FUNCTION nc_inspection_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
       NEW."odometerKm" IS DISTINCT FROM OLD."odometerKm"
    OR NEW."fuelEighths" IS DISTINCT FROM OLD."fuelEighths"
    OR NEW."vehicleUnitId" <> OLD."vehicleUnitId"
    OR NEW."type" <> OLD."type"
    OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
    OR NEW."signatureFileId" IS DISTINCT FROM OLD."signatureFileId"
    OR NEW."notes" IS DISTINCT FROM OLD."notes"
    OR NEW."pendencies" IS DISTINCT FROM OLD."pendencies"
    OR (NEW."status" <> OLD."status" AND NOT (OLD."status" = 'COMPLETED' AND NEW."status" = 'APPROVED'))
  ) THEN
    RAISE EXCEPTION 'Vistoria concluída não pode ser alterada.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "inspections_guard" BEFORE UPDATE ON "inspections"
  FOR EACH ROW EXECUTE FUNCTION nc_inspection_guard();

CREATE OR REPLACE FUNCTION nc_inspection_evidence_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
  SELECT "status" INTO parent_status FROM "inspections"
   WHERE "id" = COALESCE(NEW."inspectionId", OLD."inspectionId");
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Evidências de vistoria concluída não podem ser alteradas.' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inspection_items', 'inspection_damages', 'inspection_photos'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nc_inspection_evidence_guard()',
      t || '_guard', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------
--  5. Row-Level Security
--  Cada transação da API declara a empresa em `app.org_id`
--  (SET LOCAL via set_config). A política só deixa ver e gravar
--  linhas dessa empresa. FORCE faz a regra valer também para o
--  dono das tabelas — o usuário com que a própria API conecta.
--
--  `app.bypass_rls = on` existe para o que é legitimamente da
--  plataforma: login (descobrir os vínculos do usuário), Master,
--  rotinas agendadas que percorrem todas as empresas e o seed.
--  O código só liga o bypass em `PrismaService.platform()`.
--
--  Tabelas de plataforma sem RLS (acesso só por código de
--  plataforma): subscriptions, saas_invoices, domains,
--  support_access_grants, support_tickets, inbound_webhook_events.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION nc_current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION nc_rls_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on' $$;

CREATE OR REPLACE FUNCTION nc_enable_tenant_rls(tbl text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I USING (nc_rls_bypass() OR "organizationId" = nc_current_org()) '
    'WITH CHECK (nc_rls_bypass() OR "organizationId" = nc_current_org())', tbl);
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema()
       AND c.column_name = 'organizationId'
       AND t.table_type = 'BASE TABLE'
       AND c.table_name NOT IN (
         'subscriptions', 'saas_invoices', 'domains', 'support_access_grants',
         'support_tickets', 'inbound_webhook_events'
       )
  LOOP
    PERFORM nc_enable_tenant_rls(r.table_name);
  END LOOP;
END $$;
