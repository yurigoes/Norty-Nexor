-- Unicidades com coluna anulável: no PostgreSQL, NULL nunca é igual a
-- NULL, então o @@unique do schema não impede duas tarifas "para todas as
-- filiais" da mesma categoria, nem duas integrações globais do mesmo
-- provedor. Os índices parciais fecham essa brecha.
CREATE UNIQUE INDEX "rate_tables_org_category_all_branches"
  ON "rate_tables" ("organizationId", "categoryId") WHERE "branchId" IS NULL;

CREATE UNIQUE INDEX "integration_configs_global_provider"
  ON "integration_configs" ("provider") WHERE "organizationId" IS NULL;
