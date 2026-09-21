-- O protocolo da consulta pública.
--
-- Sorteado, e não o `number` sequencial: aquele é `#123` mais um, e
-- quem tivesse um protocolo teria todos.

-- Entra nulo para caber nas 600 linhas que já existem.
ALTER TABLE "tickets" ADD COLUMN "protocol" TEXT;

-- Preenche o que já existe.
--
-- A conta é correlacionada com `tickets.id` de propósito: uma subconsulta
-- sem correlação o Postgres avalia uma vez só, e as 600 linhas sairiam
-- com o mesmo código — que a restrição de unicidade logo abaixo
-- recusaria. Derivar do `id` (que já é único) dá códigos distintos sem
-- depender de `random()` por linha.
--
-- Estes são previsíveis para quem souber o `id` do chamado, que não é
-- público. Chamado novo recebe código sorteado com `randomInt` na
-- aplicação, e é esse o caminho que importa daqui para a frente.
UPDATE "tickets" SET "protocol" = (
  SELECT string_agg(
    substr(
      '234679CDFGHJKMNPQRTWXYZ',
      1 + (('x' || substr(md5("tickets"."id"::text || 'protocolo'), g * 2 + 1, 2))::bit(8)::int % 23),
      1
    ),
    ''
    ORDER BY g
  )
  FROM generate_series(0, 7) AS g
)
WHERE "protocol" IS NULL;

ALTER TABLE "tickets" ALTER COLUMN "protocol" SET NOT NULL;

CREATE UNIQUE INDEX "tickets_protocol_key" ON "tickets"("protocol");
