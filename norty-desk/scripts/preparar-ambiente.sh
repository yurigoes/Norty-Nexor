#!/usr/bin/env bash
# Deixa esta máquina de desenvolvimento pronta para rodar suíte e lint.
#
# Existe porque o contêiner de desenvolvimento reinicia e leva o cluster
# do Postgres junto: some o papel `desk`, somem os bancos, e a suíte
# falha com "Authentication failed" — que parece defeito de código e não
# é. É idempotente: rodar com tudo no lugar não muda nada.
set -uo pipefail

cd "$(dirname "$0")/.."
titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

PAPEL="${PAPEL:-desk}"
BANCOS="${BANCOS:-nortydesk nortydesk_test nortydesk_shadow}"
HBA="${HBA:-/etc/postgresql/16/main/pg_hba.conf}"

titulo "Postgres de pé?"
if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  service postgresql start >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break; sleep 1; done
fi
pg_isready -h 127.0.0.1 -p 5432 || { echo "não subiu"; exit 1; }

# A URL de conexão do projeto não tem senha, então a conexão local
# precisa ser `trust`. Num contêiner descartável de desenvolvimento
# isso é aceitável; em qualquer outro lugar não seria.
if [ -f "$HBA" ] && grep -qE '^host.*127\.0\.0\.1/32\s+scram-sha-256' "$HBA"; then
  titulo "Liberando conexão local sem senha (só nesta máquina de desenvolvimento)"
  sed -i -E 's#^(host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+)scram-sha-256#\1trust#' "$HBA"
  service postgresql reload >/dev/null 2>&1
fi

titulo "Papel e bancos"
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$PAPEL'\"" 2>/dev/null | grep -q 1 \
  || su - postgres -c "psql -q -c \"CREATE ROLE $PAPEL LOGIN SUPERUSER\"" 2>/dev/null
echo "  papel $PAPEL: ok"
for db in $BANCOS; do
  su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$db'\"" 2>/dev/null | grep -q 1 \
    || su - postgres -c "createdb -O $PAPEL $db" 2>/dev/null
  echo "  banco $db: ok"
done

titulo "Migrações"
(cd apps/api && npx prisma migrate deploy 2>&1 | tail -1)
(cd apps/api && DATABASE_URL="postgresql://$PAPEL@127.0.0.1:5432/nortydesk_test?schema=public" \
  npx prisma migrate deploy 2>&1 | tail -1)

titulo "Pronto"
cat <<'FINAL'
  npm run lint
  npm run test -w @norty-desk/api
  DEMO=1 npm run db:seed     # dados de demonstração, se quiser o aplicativo
FINAL
