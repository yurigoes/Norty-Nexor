-- Identificar a empresa na abertura sem login: nome aproximado ou
-- documento exato.
--
-- Duas colunas geradas e dois índices. Escrita à mão porque o
-- `migrate diff` não enxerga `GENERATED ALWAYS AS` — ele emitiria as
-- colunas como texto comum, e o banco passaria a aceitar escrita numa
-- coluna que ninguém deve escrever. As duas estão declaradas no
-- `schema.prisma` como `Unsupported`, que é o que impede o diff
-- seguinte de derrubá-las (CLAUDE.md, armadilha 2).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- O nome reduzido à forma que a busca compara.
--
-- A **mesma** regra existe em `nomeDeEmpresaNormalizado`, em
-- `packages/shared`: aquela normaliza o que a pessoa digita, esta
-- normaliza o que está gravado, e as duas precisam concordar ou a busca
-- não acha o que existe. Há um teste que confere as duas contra a mesma
-- lista de nomes — é ele que segura esta duplicação.
--
-- Por que tirar a forma societária: numa busca por semelhança o sufixo
-- comum pontua como qualquer outra palavra. Medido antes de escrever
-- isto: "xyz ltda" contra "Empresa do João … LTDA" dava 0,556, acima do
-- limiar de 0,5 — e cai a zero com o sufixo fora dos dois lados.
--
-- `translate` em vez de `unaccent()`: a função da extensão é `stable`,
-- não `immutable`, e o Postgres recusa coluna gerada com ela. O caminho
-- usual é embrulhá-la numa função declarada `immutable` à mão, o que é
-- mentir para o planejador. `translate` é `immutable` de verdade.
ALTER TABLE "clients" ADD COLUMN "buscaNome" text
  GENERATED ALWAYS AS (
    COALESCE(
      NULLIF(
        btrim(
          regexp_replace(
            btrim(regexp_replace(
              lower(translate("name",
                'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
                'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
              '\s+', ' ', 'g')),
            '([[:space:],]+(s/a|s/s|ltda|eireli|epp|ss|sa|me)\.?)+$', '', 'g'
          )
        ),
        ''
      ),
      btrim(regexp_replace(
        lower(translate("name",
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
          'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
        '\s+', ' ', 'g'))
    )
  ) STORED;

-- Só os dígitos: é o que faz "12.345.678/0001-90" e "12345678000190"
-- acharem a mesma empresa.
ALTER TABLE "clients" ADD COLUMN "documentoDigitos" text
  GENERATED ALWAYS AS (regexp_replace(COALESCE("document", ''), '\D', '', 'g')) STORED;

-- Trigrama para a busca por semelhança. `gin_trgm_ops` é o que atende
-- o operador `<%` (word_similarity acima do limiar).
CREATE INDEX "clients_busca_nome" ON "clients" USING gin ("buscaNome" gin_trgm_ops);

-- E o documento é busca exata, então índice comum basta.
CREATE INDEX "clients_documento_digitos" ON "clients" ("organizationId", "documentoDigitos");
