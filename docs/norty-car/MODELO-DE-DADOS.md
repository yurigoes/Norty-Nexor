# Norty Car — Modelo de dados

Fonte da verdade: [`apps/car-api/prisma/schema.prisma`](../../apps/car-api/prisma/schema.prisma)
e as migrações em `apps/car-api/prisma/migrations` (as regras que o Prisma não
expressa — exclusão, CHECKs, gatilhos, RLS — estão em
`*_integridade_e_rls` e `*_unicidades_parciais`).

Convenções: chave primária UUID; placa, CPF, RENAVAM e chassi **nunca** são
chave — são únicos por empresa e podem ser corrigidos sem quebrar histórico;
dinheiro `Decimal(12,2)`; instantes `timestamptz`; vencimentos `date`; toda
tabela de empresa tem `organizationId` (inclusive as filhas, para o RLS valer
de forma uniforme).

## Plataforma (sem RLS)

| Tabela | Papel |
|---|---|
| `users` | identidade única (e-mail); `platformRole` para a equipe Norty; MFA cifrado; bloqueio progressivo |
| `sessions` | sessão por dispositivo: hash do refresh, contexto escolhido, MFA verificado, revogação |
| `password_reset_tokens` | link de definição de senha (hash, 60 min, uso único) |
| `plans`, `subscriptions`, `saas_invoices` | financeiro do SaaS — separado do financeiro da locadora |
| `domains` | domínio → empresa (único globalmente), verificação DNS |
| `support_access_grants`, `support_tickets`, `support_ticket_messages` | suporte e acesso excepcional |
| `platform_settings`, `inbound_webhook_events` | configurações globais; eventos externos com unicidade (provedor, evento) |

## Empresa — estrutura e acesso

`organizations` (status, fuso, regras em `settings`, módulos extras) →
`branches` (filiais) · `roles` (perfis com lista de permissões) ·
`memberships` (usuário × empresa × perfil, `allBranches`, alçada) →
`membership_branches` · `org_counters` (numeração) · `files` (anexos
polimórficos: `entityType` + `entityId`, categoria, vencimento, liberação ao
cliente) · `audit_logs` (imutável).

## Frota

```
vehicle_categories ─┬─ vehicle_models ── vehicle_versions
vehicle_makes ──────┘        │
                             └── vehicle_units (a placa)
                                   ├── vehicle_status_changes   (imutável)
                                   ├── vehicle_timeline_events  (imutável)
                                   ├── odometer_readings        (imutável)
                                   └── vehicle_allocations      (agenda; exclusão anti-sobreposição)
```

Modelo (catálogo, fotos, arquivo 3D, pontos de interesse) é separado da
unidade física (placa, RENAVAM, chassi, cor real, hodômetro, filial, situação).
Situação comercial e operacional são colunas separadas.

## Tarifas

`rate_tables` (categoria × filial opcional; diária, pacotes semanal/mensal,
km incluído, km excedente, condutor adicional, tolerância, caução, mensalidade
de longo prazo) · `extra_services` (por dia ou valor fixo). Índice parcial
garante uma tarifa geral por categoria.

## Pessoas

`customers` (PF/PJ, documento único por empresa, bloqueio, anonimização) ·
`drivers` (CPF único, CNH com validade) · `customer_links` (acesso ao portal).

## Locações

```
reservations ── (checkout) ──► rental_contracts
                                 ├── contract_versions   (retrato a cada alteração; imutável)
                                 ├── contract_vehicles   (intervalos por carro; 1 aberto)
                                 ├── contract_drivers    (intervalos por motorista; 1 principal aberto)
                                 ├── contract_extras
                                 ├── security_deposits ── deposit_entries
                                 └── receivables ── payments
```

## Financeiro

`receivables` / `payables` (títulos; status OPEN/PARTIAL/PAID/CANCELLED;
contas a pagar com aprovação) · `payments` (efetivo; idempotência por empresa,
unicidade do evento do provedor, valor e destino imutáveis) · `cost_centers` ·
`suppliers` · `security_deposits` + `deposit_entries` (caução, com aprovação de
utilização e devolução).

## Estoque e manutenção

`inventory_categories` · `inventory_products` (custo médio com 4 casas) ·
`inventory_locations` (por filial) · `stock_balances` (CHECK ≥ 0) ·
`inventory_movements` (imutável, idempotente, com vínculo a placa, motorista,
OS, pedido) · `purchase_orders` + itens · `inventory_counts` + itens ·
`maintenance_service_types` · `work_orders` + `work_order_items` +
`work_order_events` · `maintenance_plans` · `tires` + `tire_events`
(uma posição instalada por veículo).

## Vistorias

`inspection_templates` (checklist configurável) · `inspections` (tipo,
hodômetro, combustível em oitavos, confirmação) · `inspection_items` ·
`inspection_damages` (região do mapa) · `inspection_photos`. Concluída, a
evidência fica congelada pelo banco.

## Regularização, venda, site e portal

`traffic_infractions` + `infraction_events` (status administrativo e financeiro
separados) · `insurance_policies` · `claims` + `claim_events` ·
`refuel_records` (com sinais de inconsistência) · `vehicle_sales` +
`sale_proposals` · `site_configs` · `leads` · `service_requests` + mensagens.

## Notificações e integrações

`notifications` (audiência por permissão/filial ou destinatário; `dedupeKey`
única) · `notification_reads` · `notification_deliveries` (fila por canal com
tentativas) · `integration_configs` (segredo cifrado; global ou por empresa) ·
`api_keys` (só hash) · `webhook_endpoints` (segredo cifrado).

## Restrições que o banco garante

| Regra | Onde |
|---|---|
| Carro sem dois compromissos sobrepostos (com preparo) | `vehicle_allocations_no_overlap` (EXCLUDE gist) |
| Um veículo e um motorista principal abertos por contrato | índices únicos parciais |
| Estoque nunca negativo | `stock_balances_non_negative` |
| Pagamento > 0 e com um único destino | CHECKs em `payments` |
| Uma mensalidade por competência | `unique (contractId, kind, competence)` |
| Mesma operação repetida não duplica | `unique (organizationId, idempotencyKey)` em pagamentos, movimentos de estoque e caução |
| Um pneu por posição; um anúncio aberto por veículo | índices únicos parciais |
| Histórico imutável; registros financeiros sem DELETE | gatilhos `nc_forbid_change`, `nc_payment_guard`, `nc_deposit_entry_guard`, `nc_inspection_*` |
| Isolamento entre empresas | políticas `tenant_isolation` com `FORCE ROW LEVEL SECURITY` |

## Evolução

Toda mudança de schema vira migração versionada (`prisma migrate dev` em
desenvolvimento, `migrate deploy` em produção). Tabela nova com
`organizationId` precisa chamar `nc_enable_tenant_rls('<tabela>')` na própria
migração — a suíte de testes falha se uma tabela de empresa ficar sem RLS.
