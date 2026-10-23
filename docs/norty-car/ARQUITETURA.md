# Norty Car — Arquitetura

**Norty Car | Sistema de Controle de Carros** é um SaaS multiempresa para
locadoras de veículos. Vive no mesmo monorepo do my Home (produto irmão do
ecossistema Norty), com código próprio e sem dependência cruzada:

```
packages/car-shared   Domínio, permissões, regras puras e contratos de API
apps/car-api          API REST — NestJS 11 + Prisma 6 + PostgreSQL 16
apps/car-web          Aplicativo, portal do cliente, Master e sites — React 19 + Vite
infra/norty-car       Dockerfiles, compose, nginx, Caddy (domínios próprios)
scripts/norty-car     bootstrap e backup
```

```
Navegador ──► car-web (SPA) ──HTTPS──► car-api ──► PostgreSQL (RLS)
                 │                         │
                 │                         ├──► armazenamento de arquivos (volume / S3)
                 └── site da locadora      ├──► SMTP (opcional)
                     (mesmo bundle,        ├──► provedores de pagamento (webhook assinado)
                      outro host)          └──► Anthropic (Norty IA, opcional)
```

## Monólito modular

Uma API, um banco, módulos com fronteira clara. É a arquitetura que cabe no
tamanho do produto hoje: transação única entre reserva, agenda, contrato e
financeiro (o que microsserviços tornariam um problema distribuído), um
deploy, um backup. Os módulos se falam por serviços injetados, nunca por
consulta à tabela alheia quando existe um serviço dono da regra.

| Grupo | Módulos (apps/car-api/src/modules) |
|---|---|
| Fundação | auth, organizations (filiais, perfis, usuários, suporte, auditoria), files, pricing, health |
| Frota e pessoas | fleet, catalog, customers, documents |
| Locações e financeiro | reservations, contracts, deposits, finance, suppliers, payments-webhooks |
| Operação | inspections, inventory, maintenance, tires, refuel |
| Regularização e indicadores | infractions, claims, sales, dashboard, reports, profitability, notifications, search, ai |
| Portais | platform (Master), portal, public-site, domains, integrations |

Serviços transversais ficam em `src/common` e são globais: `PrismaService`,
`AuditService`, `TimelineService`, `CounterService`, `CryptoService`,
`MailService`, `StorageService`, `AvailabilityService`,
`VehicleStatusService`, `NotifyService`.

## Multiempresa

Três escopos, e cada tabela pertence a exatamente um:

| Escopo | Exemplos | Proteção |
|---|---|---|
| Plataforma | users, sessions, plans, subscriptions, domains, support grants | acesso só por código de plataforma |
| Empresa | tudo com `organizationId` | **Row-Level Security forçado** |
| Filial | registros com `branchId` | filtro de filiais autorizadas no serviço |

### Como o contexto é resolvido

1. O login autentica a **identidade** (e-mail, senha, MFA).
2. O servidor lista os **contextos reais** do usuário: vínculos ativos com
   empresas, cadastros no portal do cliente, acessos de suporte autorizados e,
   para a equipe Norty, o Master.
3. A escolha fixa o contexto **na sessão** (tabela `sessions`), e o token de
   acesso carrega só identificadores.
4. A cada requisição o `AuthGuard` relê do banco: sessão viva, usuário ativo,
   vínculo ativo, perfil, filiais, módulos do plano, prazo do acesso de
   suporte. Revogar vale na hora.

O navegador nunca escolhe a empresa por parâmetro: trocar um id no corpo ou
no cabeçalho não muda nada, porque o contexto vem da sessão.

### Row-Level Security

`PrismaService.tenant(ctx, fn)` abre uma transação e executa
`set_config('app.org_id', …, true)`. A política em cada tabela de empresa só
deixa ler e gravar linhas daquela empresa. Com `FORCE ROW LEVEL SECURITY`, a
regra vale também para o dono das tabelas — o próprio usuário da API.

Consequência prática: um `where` esquecido devolve vazio em vez de vazar
dados. O teste `foundation.test.ts` verifica que **toda** tabela com
`organizationId` (exceto as de plataforma listadas) tem RLS ativo e forçado —
tabela nova sem RLS quebra a suíte.

`PrismaService.platform(fn)` liga o bypass (`app.bypass_rls`). É usado só por
login, Master, rotinas agendadas e site público (que resolve a empresa pelo
domínio antes de consultar).

## Permissões

Permissões granulares (`packages/car-shared/src/permissions.ts`) agrupadas por
módulo. Permissão efetiva = permissões do perfil ∩ módulos do plano. Os onze
perfis iniciais são **modelos editáveis**. A mesma lista monta o menu e
alimenta o `PermissionsGuard`; o servidor sempre decide.

Além da permissão, ações de valor respeitam a **alçada** do usuário
(`approvalLimit` no vínculo): aprovar uma OS de R$ 8.000 exige a permissão
*e* um limite que cubra o valor.

## Motor de disponibilidade

Disponibilidade não é um campo de status. Reserva confirmada, contrato,
manutenção e bloqueio viram um **bloco** em `vehicle_allocations`, com
`blockedUntil = fim + tempo de preparo`. A migração cria uma **restrição de
exclusão** (`btree_gist`):

```sql
EXCLUDE USING gist ("vehicleUnitId" WITH =, tstzrange("startsAt", "blockedUntil", '[)') WITH &&)
WHERE (active)
```

Duas confirmações simultâneas do mesmo carro no mesmo período: uma passa, a
outra recebe 409 — garantido pelo banco, não por verificação na aplicação.
Consultar disponibilidade não reserva nada; reservar é inserir o bloco.

Além da agenda, o `AvailabilityService` recusa carro vendido, à venda,
bloqueado ou excluído. Situação comercial (Disponível, Reservado, Alugado, À
venda, Vendido) e operacional (Liberado, Em vistoria, Em manutenção,
Bloqueado, Aguardando liberação) são separadas; a comercial de locação é
recalculada a partir da agenda.

## Histórico que não se perde

| Registro | Garantia |
|---|---|
| Auditoria, linha do tempo por placa, mudanças de situação, versões de contrato, eventos de OS/infração/sinistro, leituras de hodômetro, movimentações de estoque, eventos de pneu | gatilho bloqueia UPDATE e DELETE |
| Títulos, pagamentos, contratos, reservas, vistorias, veículos, clientes, arquivos | gatilho bloqueia DELETE (cancela-se, estorna-se, exclui-se logicamente) |
| Pagamento | valor, sentido e título fixos depois de gravados |
| Movimento de caução | só a decisão de aprovação muda, uma vez |
| Vistoria concluída | itens, avarias e fotos congelados |

Troca de motorista e de veículo fecham o intervalo anterior (`endAt`) e abrem
outro: o contrato guarda quem dirigia qual carro em cada momento — é o que
resolve a indicação de condutor de uma multa meses depois.

## Dinheiro, datas e números

- Dinheiro é `Decimal(12,2)` no banco e centavos inteiros nas contas
  (`packages/car-shared/src/rules/money.ts`). O `SerializeInterceptor`
  converte Decimal em número uma única vez, na resposta.
- Datas com hora são `timestamptz` (UTC); vencimentos são `date`. A
  exibição usa o fuso da empresa (padrão `America/Sao_Paulo`).
- Intervalos são semiabertos `[início, fim)`: devolver às 10h e retirar às
  10h não conflita.

## Concorrência e idempotência

| Situação | Mecanismo |
|---|---|
| Duas reservas do mesmo carro | restrição de exclusão no banco |
| Saída de estoque concorrente | `UPDATE … WHERE quantity >= x` + `CHECK (quantity >= 0)` |
| Clique duplo / reenvio na baixa de pagamento | `idempotencyKey` única por empresa |
| Mesmo evento de pagamento entregue duas vezes | `unique (provider, providerEventId)` e `inbound_webhook_events` |
| Mensalidade gerada duas vezes | `unique (contractId, kind, competence)` |
| Mesmo alerta da rotina agendada | `unique (organizationId, dedupeKey)` |
| Numeração (contratos, OS…) | `INSERT … ON CONFLICT DO UPDATE … RETURNING` dentro da transação |
| Rotina agendada em duas instâncias | `pg_try_advisory_lock` |

## Arquivos

Upload pela API, tipo decidido pelos **bytes** (não pela extensão), limite de
tamanho, chave aleatória fora da pasta pública. Download sempre pela API, que
confere a permissão da entidade dona do arquivo (documento pessoal exige
`customers.sensitive`; o cliente só baixa o que foi liberado e é dele). Para
`<img>`, a API emite URL temporária assinada (5 minutos). O driver atual grava
em volume; o contrato do `StorageService` é o de um armazenamento de objetos.

## Notificações e rotinas

`NotifyService` cria notificações internas por audiência (permissão + filial)
ou destinatário, com `dedupeKey`. Canais externos (e-mail, webhook) entram numa
fila (`notification_deliveries`) com tentativas e backoff. Sem credencial, o
envio fica registrado como **não configurado** — nunca simulado.

## Frontend

React 19 + Vite, sem framework de estado: `useApi`/`useAction` sobre um cliente
HTTP único (`lib/api.ts`). Access token em memória; refresh em cookie
`httpOnly`. Design system próprio em CSS com tokens (`styles/tokens.css`),
tema claro e escuro, componentes acessíveis por teclado. O mesmo bundle
atende quatro superfícies: equipe da locadora, portal do cliente, Master
Norty e o site público de cada locadora (por host).
