-- =========================================================
-- VEYRA — Esquema PostgreSQL
--
-- Três decisões atravessam o arquivo inteiro:
--
--  1. Toda tabela operacional carrega `organization_id` e o índice
--     começa por ele. O isolamento multi-tenant não é uma convenção
--     de código: é a forma da tabela.
--
--  2. Regra que não pode ser burlada vive aqui, não na aplicação.
--     Uma cota por grupo, um voto por unidade, uma avaliação por
--     protocolo: são `UNIQUE`, porque validar só na aplicação deixa
--     duas requisições simultâneas passarem juntas.
--
--  3. Dinheiro é NUMERIC(12,2). Em ponto flutuante 0.1 + 0.2 não
--     fecha caixa.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- busca por nome e documento

-- ---------------------------------------------------------
-- Plataforma
-- ---------------------------------------------------------

CREATE TYPE organization_status AS ENUM
  ('ativa', 'em_teste', 'suspensa', 'bloqueada', 'inadimplente', 'cancelada');

CREATE TYPE plan_tier AS ENUM ('starter', 'growth', 'scale', 'enterprise');

CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  tier            plan_tier NOT NULL,
  preco_mensal    NUMERIC(12,2) NOT NULL,
  preco_anual     NUMERIC(12,2) NOT NULL,
  -- NULL em qualquer limite significa ilimitado; 0 significa bloqueado.
  -- A distinção importa: são respostas diferentes para o mesmo campo.
  limites         JSONB NOT NULL,
  modulos         TEXT[] NOT NULL DEFAULT '{}',
  add_ons         TEXT[] NOT NULL DEFAULT '{}',
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               TEXT NOT NULL,
  documento          TEXT NOT NULL UNIQUE,
  slug               CITEXT NOT NULL UNIQUE,
  status             organization_status NOT NULL DEFAULT 'em_teste',
  plan_id            UUID NOT NULL REFERENCES plans(id),
  segmentos          TEXT[] NOT NULL DEFAULT '{}',
  modulos_liberados  TEXT[] NOT NULL DEFAULT '{}',
  trial_termina_em   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id          UUID NOT NULL REFERENCES plans(id),
  mrr              NUMERIC(12,2) NOT NULL DEFAULT 0,
  ciclo            TEXT NOT NULL CHECK (ciclo IN ('mensal', 'anual')),
  inicia_em        DATE NOT NULL,
  cancela_em       DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Uma assinatura vigente por organização. Trocar de plano encerra a
  -- anterior; duas vigentes ao mesmo tempo dobrariam a cobrança.
  UNIQUE (organization_id, cancela_em)
);

CREATE TABLE usage_snapshots (
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  periodo              CHAR(7) NOT NULL,             -- 'YYYY-MM'
  usuarios             INTEGER NOT NULL DEFAULT 0,
  leads                INTEGER NOT NULL DEFAULT 0,
  mensagens            INTEGER NOT NULL DEFAULT 0,
  emails               INTEGER NOT NULL DEFAULT 0,
  interacoes_ia        INTEGER NOT NULL DEFAULT 0,
  armazenamento_bytes  BIGINT  NOT NULL DEFAULT 0,
  chamadas_api         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, periodo)
);

-- ---------------------------------------------------------
-- Identidade e acesso
-- ---------------------------------------------------------

CREATE TABLE roles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  chave            TEXT NOT NULL,
  nome             TEXT NOT NULL,
  -- Papel de sistema (organization_id NULL) não pode ser editado pelo
  -- cliente; papel personalizado pertence a uma organização.
  UNIQUE NULLS NOT DISTINCT (organization_id, chave)
);

CREATE TABLE permissions (
  chave        TEXT PRIMARY KEY,                     -- 'leads.criar'
  modulo       TEXT NOT NULL,
  acao         TEXT NOT NULL,
  descricao    TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(chave) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                      TEXT NOT NULL,
  email                     CITEXT NOT NULL,
  telefone                  TEXT,
  -- Argon2id. A API nunca devolve esta coluna: o serializador usa um
  -- tipo que sequer tem o campo.
  senha_hash                TEXT NOT NULL,
  role_id                   UUID NOT NULL REFERENCES roles(id),
  team_id                   UUID,
  ativo                     BOOLEAN NOT NULL DEFAULT TRUE,
  dois_fatores_secret       TEXT,
  troca_senha_obrigatoria   BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_acesso             TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- E-mail é único dentro da organização, não globalmente: a mesma
  -- pessoa pode ser usuária de duas empresas clientes.
  UNIQUE (organization_id, email)
);

-- Concessão e revogação individual. A revogação vence o papel.
CREATE TABLE user_permission_overrides (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key  TEXT NOT NULL REFERENCES permissions(chave) ON DELETE CASCADE,
  concedida       BOOLEAN NOT NULL,
  PRIMARY KEY (user_id, permission_key)
);

CREATE TABLE teams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  supervisor_id    UUID REFERENCES users(id),
  UNIQUE (organization_id, nome)
);

ALTER TABLE users ADD CONSTRAINT users_team_fk
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Só o hash. Um dump do banco não devolve tokens utilizáveis.
  token_hash   TEXT NOT NULL UNIQUE,
  expira_em    TIMESTAMPTZ NOT NULL,
  revogado_em  TIMESTAMPTZ,
  ip           INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON refresh_tokens (user_id) WHERE revogado_em IS NULL;

-- ---------------------------------------------------------
-- CRM
-- ---------------------------------------------------------

CREATE TYPE lead_status AS ENUM (
  'novo', 'em_qualificacao', 'qualificado', 'quente', 'em_negociacao',
  'cotacao', 'proposta', 'venda', 'perdido', 'sem_resposta',
  'desistente', 'nutricao', 'reativado');

CREATE TYPE lead_temperature AS ENUM ('frio', 'morno', 'quente', 'fervendo');

CREATE TABLE pipelines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  segmento         TEXT NOT NULL,
  padrao           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um pipeline padrão por segmento, garantido pelo índice parcial.
CREATE UNIQUE INDEX pipelines_padrao_unico
  ON pipelines (organization_id, segmento) WHERE padrao;

CREATE TABLE pipeline_stages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id    UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  ordem          SMALLINT NOT NULL,
  cor            TEXT NOT NULL,
  probabilidade  NUMERIC(4,3) NOT NULL CHECK (probabilidade BETWEEN 0 AND 1),
  UNIQUE (pipeline_id, ordem)
);

CREATE TABLE lead_sources (
  chave      TEXT PRIMARY KEY,
  nome       TEXT NOT NULL
);

CREATE TABLE leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                  TEXT NOT NULL,
  telefone              TEXT NOT NULL,
  whatsapp              TEXT,
  email                 CITEXT,
  documento             TEXT,
  cidade                TEXT,
  uf                    CHAR(2),
  origem                TEXT NOT NULL REFERENCES lead_sources(chave),
  campaign_id           UUID,
  utm                   JSONB,
  product_id            UUID,
  segmento              TEXT NOT NULL,
  interesse             TEXT,
  valor_estimado        NUMERIC(12,2),
  score                 SMALLINT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  temperatura           lead_temperature NOT NULL DEFAULT 'frio',
  responsavel_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id               UUID REFERENCES teams(id) ON DELETE SET NULL,
  status                lead_status NOT NULL DEFAULT 'novo',
  pipeline_id           UUID NOT NULL REFERENCES pipelines(id),
  stage_id              UUID NOT NULL REFERENCES pipeline_stages(id),
  ultima_interacao_em   TIMESTAMPTZ,
  proxima_atividade_em  TIMESTAMPTZ,
  motivo_perda          TEXT,
  observacoes           TEXT,
  customer_id           UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O índice começa por organization_id porque toda consulta começa por
-- ele. Um índice só em `status` seria varrido para todos os tenants.
CREATE INDEX leads_org_status     ON leads (organization_id, status);
CREATE INDEX leads_org_responsavel ON leads (organization_id, responsavel_id)
  WHERE status NOT IN ('venda', 'perdido', 'desistente');
CREATE INDEX leads_org_score      ON leads (organization_id, score DESC);
CREATE INDEX leads_org_telefone   ON leads (organization_id, telefone);
CREATE INDEX leads_busca_nome     ON leads USING gin (nome gin_trgm_ops);

CREATE TABLE lead_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id          UUID REFERENCES leads(id) ON DELETE CASCADE,
  customer_id      UUID,
  canal            TEXT NOT NULL,
  titulo           TEXT NOT NULL,
  descricao        TEXT,
  autor            TEXT,
  ocorreu_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON lead_events (organization_id, lead_id, ocorreu_em DESC);

CREATE TABLE lead_scores (
  lead_id      UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  score        SMALLINT NOT NULL,
  -- Os fatores ficam guardados porque um score que ninguém consegue
  -- explicar não é usado: é contestado.
  fatores      JSONB NOT NULL,
  modelo       TEXT NOT NULL,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Clientes e catálogo
-- ---------------------------------------------------------

CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  documento         TEXT NOT NULL,
  tipo              CHAR(2) NOT NULL CHECK (tipo IN ('pf', 'pj')),
  email             CITEXT,
  telefone          TEXT NOT NULL,
  whatsapp          TEXT,
  cidade            TEXT,
  uf                CHAR(2),
  nascimento        DATE,
  responsavel_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  desde             DATE NOT NULL DEFAULT CURRENT_DATE,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Um documento por organização. O mesmo CPF pode ser cliente de duas
  -- empresas clientes diferentes — mas nunca duplicado dentro de uma.
  UNIQUE (organization_id, documento)
);

ALTER TABLE leads ADD CONSTRAINT leads_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

CREATE TABLE customer_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  cargo        TEXT,
  email        CITEXT,
  telefone     TEXT
);

CREATE TABLE customer_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  nome_arquivo  TEXT NOT NULL,
  -- Chave no armazenamento de objetos. O binário não vive no banco.
  storage_key   TEXT NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  enviado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  segmento         TEXT NOT NULL
);

CREATE TABLE products (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id                  UUID REFERENCES product_categories(id),
  nome                         TEXT NOT NULL,
  segmento                     TEXT NOT NULL,
  fornecedor                   TEXT NOT NULL,
  descricao                    TEXT,
  comissao_padrao_percentual   NUMERIC(6,3) NOT NULL DEFAULT 0,
  ativo                        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leads ADD CONSTRAINT leads_product_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- ---------------------------------------------------------
-- Ciclo comercial
-- ---------------------------------------------------------

CREATE TYPE quote_status AS ENUM
  ('rascunho', 'enviada', 'visualizada', 'aprovada', 'recusada', 'expirada');

CREATE TABLE quotes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero           TEXT NOT NULL,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  segmento         TEXT NOT NULL,
  responsavel_id   UUID NOT NULL REFERENCES users(id),
  status           quote_status NOT NULL DEFAULT 'rascunho',
  versao           SMALLINT NOT NULL DEFAULT 1,
  valida_ate       DATE NOT NULL,
  enviada_em       TIMESTAMPTZ,
  visualizada_em   TIMESTAMPTZ,
  -- Token do link público. Aleatório e revogável — o número da cotação
  -- é sequencial e serviria de convite a enumerar as dos outros.
  link_token       TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, numero, versao)
);

CREATE TABLE quote_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  rotulo         TEXT NOT NULL,
  fornecedor     TEXT NOT NULL,
  valor          NUMERIC(12,2) NOT NULL,
  parcelas       SMALLINT NOT NULL DEFAULT 1,
  valor_parcela  NUMERIC(12,2) NOT NULL,
  destaques      TEXT[] NOT NULL DEFAULT '{}',
  recomendada    BOOLEAN NOT NULL DEFAULT FALSE
);

-- Uma opção recomendada por cotação: duas recomendações não recomendam
-- nada.
CREATE UNIQUE INDEX quote_items_recomendada_unica
  ON quote_items (quote_id) WHERE recomendada;

CREATE TYPE proposal_status AS ENUM
  ('rascunho', 'enviada', 'em_analise', 'documentacao', 'aprovada', 'recusada', 'cancelada');

CREATE TABLE proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero           TEXT NOT NULL,
  quote_id         UUID REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id      UUID NOT NULL REFERENCES customers(id),
  product_id       UUID NOT NULL REFERENCES products(id),
  segmento         TEXT NOT NULL,
  responsavel_id   UUID NOT NULL REFERENCES users(id),
  status           proposal_status NOT NULL DEFAULT 'rascunho',
  valor            NUMERIC(12,2) NOT NULL,
  enviada_em       TIMESTAMPTZ,
  decidida_em      TIMESTAMPTZ,
  motivo_recusa    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, numero)
);

CREATE TABLE proposal_checklist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  descricao     TEXT NOT NULL,
  obrigatorio   BOOLEAN NOT NULL DEFAULT TRUE,
  concluido     BOOLEAN NOT NULL DEFAULT FALSE,
  concluido_em  TIMESTAMPTZ
);

CREATE TYPE contract_status AS ENUM
  ('vigente', 'pendente', 'suspenso', 'cancelado', 'encerrado', 'renovacao');

CREATE TABLE contracts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero           TEXT NOT NULL,
  proposal_id      UUID REFERENCES proposals(id) ON DELETE SET NULL,
  customer_id      UUID NOT NULL REFERENCES customers(id),
  product_id       UUID NOT NULL REFERENCES products(id),
  segmento         TEXT NOT NULL,
  status           contract_status NOT NULL DEFAULT 'pendente',
  valor            NUMERIC(12,2) NOT NULL,
  vigencia_inicio  DATE NOT NULL,
  vigencia_fim     DATE,
  renova_em        DATE,
  assinado_em      TIMESTAMPTZ,
  responsavel_id   UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, numero),
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

CREATE INDEX contracts_renovacao ON contracts (organization_id, renova_em)
  WHERE status IN ('vigente', 'renovacao');

-- Os três segmentos têm campos próprios. Um formulário genérico deixaria
-- metade das colunas nulas e a informação que importa num "observações".

CREATE TABLE consortium_details (
  contract_id          UUID PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
  administradora       TEXT NOT NULL,
  grupo                TEXT NOT NULL,
  cota                 TEXT NOT NULL,
  carta_credito        NUMERIC(12,2) NOT NULL,
  prazo_meses          SMALLINT NOT NULL,
  parcela              NUMERIC(12,2) NOT NULL,
  taxa_administracao   NUMERIC(6,3) NOT NULL,
  fundo_reserva        NUMERIC(6,3) NOT NULL,
  lance_ofertado       NUMERIC(12,2),
  lance_embutido       NUMERIC(12,2),
  contemplado          BOOLEAN NOT NULL DEFAULT FALSE,
  contemplado_em       DATE,
  -- Uma cota por grupo, por administradora. Duas requisições simultâneas
  -- para a mesma cota passariam pela validação da aplicação.
  UNIQUE (administradora, grupo, cota)
);

CREATE TABLE policies (
  contract_id           UUID PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
  seguradora            TEXT NOT NULL,
  numero_apolice        TEXT NOT NULL,
  ramo                  TEXT NOT NULL,
  franquia              NUMERIC(12,2) NOT NULL DEFAULT 0,
  premio                NUMERIC(12,2) NOT NULL,
  parcelas              SMALLINT NOT NULL DEFAULT 1,
  vigencia_inicio       DATE NOT NULL,
  vigencia_fim          DATE NOT NULL,
  renovacao_automatica  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (seguradora, numero_apolice)
);

CREATE TABLE policy_coverages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES policies(contract_id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  capital      NUMERIC(12,2) NOT NULL
);

CREATE TABLE health_plans (
  contract_id            UUID PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
  operadora              TEXT NOT NULL,
  plano                  TEXT NOT NULL,
  categoria              TEXT NOT NULL,
  acomodacao             TEXT NOT NULL,
  titular                TEXT NOT NULL,
  mensalidade            NUMERIC(12,2) NOT NULL,
  carencia_dias          SMALLINT NOT NULL DEFAULT 0,
  vigencia_inicio        DATE NOT NULL,
  reajuste_aniversario   DATE NOT NULL
);

CREATE TABLE health_plan_dependents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES health_plans(contract_id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  nascimento   DATE NOT NULL,
  parentesco   TEXT NOT NULL,
  documento    TEXT
);

-- ---------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------

CREATE TYPE receivable_status AS ENUM
  ('pendente', 'pago', 'vencido', 'cancelado', 'estornado');

CREATE TYPE payment_method AS ENUM
  ('pix', 'boleto', 'cartao', 'link', 'transferencia', 'debito_automatico');

CREATE TABLE financial_categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  UNIQUE (organization_id, nome, tipo)
);

CREATE TABLE invoices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero               TEXT NOT NULL,
  customer_id          UUID NOT NULL REFERENCES customers(id),
  contract_id          UUID REFERENCES contracts(id) ON DELETE SET NULL,
  descricao            TEXT NOT NULL,
  valor                NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  vencimento           DATE NOT NULL,
  status               receivable_status NOT NULL DEFAULT 'pendente',
  metodo               payment_method,
  pago_em              TIMESTAMPTZ,
  -- Identificador no provedor. Nunca a chave do provedor.
  referencia_externa   TEXT,
  link_pagamento       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, numero),
  -- Fatura paga sem data de pagamento é um registro que não fecha.
  CHECK ((status = 'pago') = (pago_em IS NOT NULL))
);

CREATE INDEX invoices_cobranca ON invoices (organization_id, status, vencimento);

CREATE TABLE installments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  numero       SMALLINT NOT NULL,
  vencimento   DATE NOT NULL,
  valor        NUMERIC(12,2) NOT NULL,
  status       receivable_status NOT NULL DEFAULT 'pendente',
  invoice_id   UUID REFERENCES invoices(id) ON DELETE SET NULL,
  UNIQUE (contract_id, numero)
);

CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  provedor            TEXT NOT NULL,
  metodo              payment_method NOT NULL,
  valor               NUMERIC(12,2) NOT NULL,
  status              receivable_status NOT NULL,
  referencia_externa  TEXT NOT NULL,
  recebido_em         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- O webhook do provedor pode repetir a mesma confirmação. A unicidade
  -- aqui é o que impede a fatura de ser baixada duas vezes.
  UNIQUE (provedor, referencia_externa)
);

CREATE TABLE accounts_payable (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fornecedor       TEXT NOT NULL,
  category_id      UUID REFERENCES financial_categories(id),
  descricao        TEXT NOT NULL,
  valor            NUMERIC(12,2) NOT NULL,
  vencimento       DATE NOT NULL,
  status           receivable_status NOT NULL DEFAULT 'pendente',
  pago_em          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Comissões e parceiros
-- ---------------------------------------------------------

CREATE TYPE commission_status AS ENUM ('pendente', 'aprovada', 'paga', 'estornada');

CREATE TABLE commission_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                TEXT NOT NULL,
  base                TEXT NOT NULL CHECK (base IN ('percentual', 'fixo', 'recorrente')),
  valor               NUMERIC(12,3) NOT NULL,
  product_id          UUID REFERENCES products(id) ON DELETE CASCADE,
  segmento            TEXT,
  role_key            TEXT,
  recorrencia_meses   SMALLINT NOT NULL DEFAULT 1,
  ativa               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE affiliates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                  TEXT NOT NULL,
  documento             TEXT NOT NULL,
  email                 CITEXT NOT NULL,
  telefone              TEXT NOT NULL,
  codigo                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('ativo', 'pendente', 'suspenso')),
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo),
  UNIQUE (organization_id, documento)
);

CREATE TABLE commissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id         UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  rule_id             UUID NOT NULL REFERENCES commission_rules(id),
  beneficiario_tipo   TEXT NOT NULL CHECK (beneficiario_tipo IN ('vendedor', 'afiliado', 'supervisor')),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  affiliate_id        UUID REFERENCES affiliates(id) ON DELETE SET NULL,
  base_calculo        NUMERIC(12,2) NOT NULL,
  percentual          NUMERIC(6,3),
  valor               NUMERIC(12,2) NOT NULL,
  competencia         CHAR(7) NOT NULL,
  parcela             SMALLINT NOT NULL DEFAULT 1,
  status              commission_status NOT NULL DEFAULT 'pendente',
  paga_em             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Um beneficiário recebe uma vez por contrato, regra, competência e
  -- parcela. Sem isso, reprocessar o fechamento pagaria duas vezes.
  UNIQUE (contract_id, rule_id, beneficiario_tipo, user_id, affiliate_id, competencia, parcela),
  CHECK (num_nonnulls(user_id, affiliate_id) = 1)
);

CREATE TABLE affiliate_leads (
  affiliate_id  UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  atribuido_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Um lead pertence a um afiliado só: a atribuição dupla é a origem
  -- clássica da disputa de comissão.
  PRIMARY KEY (lead_id)
);

-- ---------------------------------------------------------
-- Conversas
-- ---------------------------------------------------------

CREATE TYPE conversation_state AS ENUM
  ('nao_lida', 'ia_atendendo', 'humano_atendendo',
   'aguardando_cliente', 'aguardando_vendedor', 'encerrada');

CREATE TABLE conversations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canal                  TEXT NOT NULL,
  contato_identificador  TEXT NOT NULL,
  contato_nome           TEXT NOT NULL,
  lead_id                UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id            UUID REFERENCES customers(id) ON DELETE SET NULL,
  estado                 conversation_state NOT NULL DEFAULT 'nao_lida',
  responsavel_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  assunto                TEXT,
  ultima_mensagem_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Uma conversa aberta por contato e canal. Duas caixas para o mesmo
  -- número é exatamente o problema que a plataforma existe para acabar.
  UNIQUE (organization_id, canal, contato_identificador)
);

CREATE INDEX conversations_fila
  ON conversations (organization_id, estado, ultima_mensagem_em DESC);

CREATE TABLE conversation_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  autor            TEXT NOT NULL CHECK (autor IN ('cliente', 'ia', 'usuario', 'sistema')),
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  tipo             TEXT NOT NULL,
  conteudo         TEXT NOT NULL,
  anexo_key        TEXT,
  anexo_nome       TEXT,
  anexo_bytes      BIGINT,
  -- Identificador da mensagem no provedor. Impede duplicar quando o
  -- webhook reentrega.
  provider_message_id TEXT,
  lida             BOOLEAN NOT NULL DEFAULT FALSE,
  enviada_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, provider_message_id)
);

CREATE INDEX ON conversation_messages (conversation_id, enviada_em);

-- ---------------------------------------------------------
-- Campanhas, consentimento e blacklist
-- ---------------------------------------------------------

CREATE TABLE campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  canal            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'rascunho',
  segmento         TEXT,
  filtros          JSONB NOT NULL DEFAULT '{}',
  template_id      UUID,
  agendada_para    TIMESTAMPTZ,
  investimento     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leads ADD CONSTRAINT leads_campaign_fk
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE TABLE campaign_contacts (
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contato       TEXT NOT NULL,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  PRIMARY KEY (campaign_id, contato)
);

CREATE TABLE campaign_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contato       TEXT NOT NULL,
  evento        TEXT NOT NULL,   -- enviada, entregue, aberta, respondida, erro
  detalhe       TEXT,
  ocorreu_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON campaign_events (campaign_id, evento);

CREATE TABLE blacklist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contato           TEXT NOT NULL,
  nome              TEXT,
  canal             TEXT NOT NULL,   -- whatsapp, email, sms, telefone, todos
  motivo            TEXT NOT NULL,
  origem            TEXT NOT NULL CHECK (origem IN ('cliente', 'ia', 'operador', 'importacao')),
  registrado_por    TEXT NOT NULL,
  solicitado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reativado_em      TIMESTAMPTZ,
  -- Um registro ativo por contato e canal. O motor de envio consulta
  -- esta tabela — a checagem não depende de quem monta o público.
  UNIQUE (organization_id, contato, canal)
);

CREATE INDEX blacklist_ativa ON blacklist (organization_id, contato)
  WHERE reativado_em IS NULL;

CREATE TABLE consents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  titular           TEXT NOT NULL,
  documento         TEXT,
  finalidade        TEXT NOT NULL,
  base_legal        TEXT NOT NULL
                      CHECK (base_legal IN ('consentimento', 'contrato',
                                            'legitimo_interesse', 'obrigacao_legal')),
  canais            TEXT[] NOT NULL DEFAULT '{}',
  concedido         BOOLEAN NOT NULL,
  evidencia         TEXT,
  registrado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Suporte
-- ---------------------------------------------------------

CREATE TYPE ticket_status AS ENUM
  ('novo', 'em_atendimento', 'aguardando_cliente', 'aguardando_equipe', 'resolvido', 'encerrado');

CREATE TYPE ticket_priority AS ENUM ('baixa', 'normal', 'alta', 'critica');

CREATE TABLE ticket_sla (
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prioridade       ticket_priority NOT NULL,
  minutos          INTEGER NOT NULL CHECK (minutos > 0),
  PRIMARY KEY (organization_id, prioridade)
);

CREATE TABLE tickets (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  protocolo              TEXT NOT NULL,
  customer_id            UUID NOT NULL REFERENCES customers(id),
  assunto                TEXT NOT NULL,
  categoria              TEXT NOT NULL,
  prioridade             ticket_priority NOT NULL DEFAULT 'normal',
  status                 ticket_status NOT NULL DEFAULT 'novo',
  responsavel_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id                UUID REFERENCES teams(id) ON DELETE SET NULL,
  aberto_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  primeira_resposta_em   TIMESTAMPTZ,
  fechado_em             TIMESTAMPTZ,
  sla_vence_em           TIMESTAMPTZ NOT NULL,
  solucao                TEXT,
  -- O protocolo é o que o cliente cita ao ligar de novo. Precisa ser
  -- único dentro da organização, não só provável.
  UNIQUE (organization_id, protocolo)
);

CREATE INDEX tickets_fila ON tickets (organization_id, status, sla_vence_em)
  WHERE status NOT IN ('resolvido', 'encerrado');

CREATE TABLE ticket_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor        TEXT NOT NULL,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  conteudo     TEXT NOT NULL,
  interna      BOOLEAN NOT NULL DEFAULT FALSE,
  enviada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE csat (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id        UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES customers(id),
  nota             SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario       TEXT,
  atendente_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id          UUID REFERENCES teams(id) ON DELETE SET NULL,
  canal            TEXT NOT NULL,
  respondido_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Uma avaliação por protocolo. Reenviar o convite não pode gerar duas
  -- notas para o mesmo atendimento.
  UNIQUE (ticket_id)
);

-- ---------------------------------------------------------
-- Conhecimento e IA
-- ---------------------------------------------------------

CREATE TABLE knowledge_base (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  -- Base sem organização é a base interna do VEYRA, compartilhada por
  -- todas as organizações — e por isso só recebe conteúdo anonimizado.
  escopo           TEXT NOT NULL CHECK (escopo IN ('interna', 'organizacao'))
);

CREATE TABLE knowledge_articles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  titulo            TEXT NOT NULL,
  categoria         TEXT NOT NULL,
  segmento          TEXT,
  conteudo          TEXT NOT NULL,
  aprovado          BOOLEAN NOT NULL DEFAULT FALSE,
  usos_pela_ia      INTEGER NOT NULL DEFAULT 0,
  autor             TEXT NOT NULL,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_busca
  ON knowledge_articles USING gin (to_tsvector('portuguese', titulo || ' ' || conteudo));

CREATE TABLE ai_interactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id       UUID REFERENCES conversations(id) ON DELETE SET NULL,
  lead_id               UUID REFERENCES leads(id) ON DELETE SET NULL,
  intencao              TEXT NOT NULL,
  produto_identificado  TEXT,
  confianca             NUMERIC(4,3) NOT NULL,
  -- De onde veio a resposta. É esta coluna que permite medir quanto da
  -- operação já roda sem provedor externo.
  fonte                 TEXT NOT NULL
                          CHECK (fonte IN ('base_interna', 'conhecimento_empresa',
                                           'historico', 'produto', 'provedor_externo')),
  provedor              TEXT,
  tokens_entrada        INTEGER NOT NULL DEFAULT 0,
  tokens_saida          INTEGER NOT NULL DEFAULT 0,
  custo                 NUMERIC(12,6) NOT NULL DEFAULT 0,
  latencia_ms           INTEGER NOT NULL,
  transferiu_humano     BOOLEAN NOT NULL DEFAULT FALSE,
  ocorreu_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON ai_interactions (organization_id, ocorreu_em DESC);
CREATE INDEX ON ai_interactions (organization_id, fonte);

-- Metadados anonimizados que alimentam a base interna. Sem nome, sem
-- telefone, sem documento: só a forma da pergunta e o que funcionou.
CREATE TABLE ai_knowledge (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta_normalizada TEXT NOT NULL,
  categoria           TEXT NOT NULL,
  segmento            TEXT,
  resposta_aprovada   TEXT NOT NULL,
  acertos             INTEGER NOT NULL DEFAULT 0,
  erros               INTEGER NOT NULL DEFAULT 0,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pergunta_normalizada, categoria)
);

-- ---------------------------------------------------------
-- Automações, tarefas e notificações
-- ---------------------------------------------------------

CREATE TABLE automations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  gatilho          TEXT NOT NULL,
  nos              JSONB NOT NULL,
  ativa            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  entidade        TEXT NOT NULL,
  entidade_id     UUID NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('executando', 'sucesso', 'erro', 'cancelada')),
  passos          JSONB NOT NULL DEFAULT '[]',
  erro            TEXT,
  iniciada_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminada_em    TIMESTAMPTZ,
  -- Uma execução por automação e entidade. Sem isso, dois eventos quase
  -- simultâneos disparariam a mesma cadência duas vezes para o mesmo lead.
  UNIQUE (automation_id, entidade, entidade_id, iniciada_em)
);

CREATE INDEX ON automation_runs (automation_id, iniciada_em DESC);

CREATE TABLE tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,
  descricao        TEXT,
  responsavel_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id          UUID REFERENCES leads(id) ON DELETE CASCADE,
  customer_id      UUID REFERENCES customers(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL,
  prioridade       ticket_priority NOT NULL DEFAULT 'normal',
  vence            TIMESTAMPTZ NOT NULL,
  concluida_em     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tasks_abertas ON tasks (organization_id, responsavel_id, vence)
  WHERE concluida_em IS NULL;

CREATE TABLE appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  inicia_em        TIMESTAMPTZ NOT NULL,
  termina_em       TIMESTAMPTZ NOT NULL,
  recorrencia      TEXT,
  CHECK (termina_em > inicia_em)
);

CREATE TABLE notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  categoria        TEXT NOT NULL,
  titulo           TEXT NOT NULL,
  detalhe          TEXT NOT NULL,
  rota             TEXT,
  lida_em          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_nao_lidas ON notifications (user_id, created_at DESC)
  WHERE lida_em IS NULL;

-- ---------------------------------------------------------
-- Plataforma: auditoria, integrações e API
-- ---------------------------------------------------------

CREATE TABLE audit_logs (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  usuario          TEXT NOT NULL,
  papel            TEXT NOT NULL,
  acao             TEXT NOT NULL,
  entidade         TEXT NOT NULL,
  entidade_id      UUID,
  antes            JSONB,
  depois           JSONB,
  ip               INET NOT NULL,
  user_agent       TEXT,
  ocorreu_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON audit_logs (organization_id, ocorreu_em DESC);
CREATE INDEX ON audit_logs (entidade, entidade_id);

CREATE TABLE integrations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chave                  TEXT NOT NULL,
  categoria              TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'desconectado',
  -- Credenciais cifradas na aplicação antes de chegar aqui. Um dump do
  -- banco não devolve tokens utilizáveis.
  credenciais_cifradas   BYTEA,
  ultima_sincronizacao   TIMESTAMPTZ,
  mensagem_erro          TEXT,
  UNIQUE (organization_id, chave)
);

CREATE TABLE api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  prefixo          TEXT NOT NULL,
  -- Só o hash. O segredo aparece uma única vez, na criação.
  chave_hash       TEXT NOT NULL UNIQUE,
  escopos          TEXT[] NOT NULL DEFAULT '{}',
  ultimo_uso       TIMESTAMPTZ,
  expira_em        TIMESTAMPTZ,
  revogada_em      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhooks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url                    TEXT NOT NULL,
  eventos                TEXT[] NOT NULL,
  -- Segredo do HMAC. Nunca sai da API.
  segredo_cifrado        BYTEA NOT NULL,
  ativo                  BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_entrega         TIMESTAMPTZ,
  falhas_consecutivas    SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (organization_id, url)
);

CREATE TABLE webhook_deliveries (
  id             BIGSERIAL PRIMARY KEY,
  webhook_id     UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  evento         TEXT NOT NULL,
  payload        JSONB NOT NULL,
  status_http    SMALLINT,
  tentativa      SMALLINT NOT NULL DEFAULT 1,
  entregue_em    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON webhook_deliveries (webhook_id, created_at DESC);
