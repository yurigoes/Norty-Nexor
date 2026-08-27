#!/usr/bin/env bash
# =========================================================
#  LICITA+ — cria o banco no Postgres da Norty
# ---------------------------------------------------------
#  Roda NO HOST thor, como root. Cria o papel e a base que a API
#  usa, no CT do Postgres (102 por padrão), e imprime a
#  DATABASE_URL pronta para colar no .env.
#
#  É idempotente: rodar duas vezes não quebra nada e não troca a
#  senha de um papel que já existe — trocar a senha por descuido
#  derrubaria a API que já estivesse usando a antiga.
#
#  Uso:
#    ./preparar-banco.sh                 # CT 102, banco e papel "licita"
#    CT_PG=102 BANCO=licita ./preparar-banco.sh
# =========================================================

set -euo pipefail

CT_PG="${CT_PG:-102}"
BANCO="${BANCO:-licita}"
PAPEL="${PAPEL:-licita}"

vermelho() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
passo()    { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# ---------- Antes de mexer em qualquer coisa ----------

command -v pct >/dev/null || {
  vermelho "pct não encontrado. Este script roda no host thor, não dentro de um CT."
  exit 1
}

pct status "$CT_PG" >/dev/null 2>&1 || {
  vermelho "CT $CT_PG não existe. Confira o número do Postgres na tabela da infra."
  exit 1
}

[[ "$(pct status "$CT_PG")" == "status: running" ]] || {
  vermelho "CT $CT_PG não está rodando. Suba com: pct start $CT_PG"
  exit 1
}

# `psql` sem shell não resolve: pct exec faz execvp direto.
if ! pct exec "$CT_PG" -- bash -c 'command -v psql' >/dev/null 2>&1; then
  vermelho "psql não encontrado dentro do CT $CT_PG — este é mesmo o container do Postgres?"
  exit 1
fi

passo "Postgres no CT $CT_PG"

pg() { pct exec "$CT_PG" -- su postgres -c "psql -tAc \"$1\""; }

# ---------- Papel ----------

if [[ "$(pg "SELECT 1 FROM pg_roles WHERE rolname='${PAPEL}'")" == "1" ]]; then
  amarelo "Papel \"$PAPEL\" já existe — mantendo a senha atual."
  SENHA=""
else
  SENHA="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)"
  pg "CREATE ROLE ${PAPEL} WITH LOGIN PASSWORD '${SENHA}'" >/dev/null
  verde "Papel \"$PAPEL\" criado."
fi

# ---------- Banco ----------

if [[ "$(pg "SELECT 1 FROM pg_database WHERE datname='${BANCO}'")" == "1" ]]; then
  amarelo "Banco \"$BANCO\" já existe."
else
  pg "CREATE DATABASE ${BANCO} OWNER ${PAPEL}" >/dev/null
  verde "Banco \"$BANCO\" criado."
fi

# O dono do banco já pode tudo nele, mas no Postgres 15+ o schema
# public deixou de ser gravável por qualquer um — sem esta linha a
# migração falharia em "permission denied for schema public".
pct exec "$CT_PG" -- su postgres -c \
  "psql -d ${BANCO} -tAc \"GRANT ALL ON SCHEMA public TO ${PAPEL}\"" >/dev/null
verde "Permissões do schema public concedidas a \"$PAPEL\"."

# ---------- Endereço ----------

IP_PG="$(pct exec "$CT_PG" -- bash -c 'hostname -I' 2>/dev/null | awk '{print $1}')"
IP_PG="${IP_PG:-192.168.15.72}"

# O Postgres precisa aceitar conexão do CT da aplicação, não só do
# próprio host. Checar aqui evita descobrir isso no meio do deploy.
if ! pct exec "$CT_PG" -- bash -c "grep -qE '^\s*listen_addresses\s*=\s*'\''\*'\''' /etc/postgresql/*/main/postgresql.conf" 2>/dev/null; then
  amarelo "Atenção: listen_addresses pode não estar aberto para a rede."
  amarelo "Se a API não conectar, confira dentro do CT $CT_PG:"
  echo "    /etc/postgresql/*/main/postgresql.conf → listen_addresses = '*'"
  echo "    /etc/postgresql/*/main/pg_hba.conf     → host $BANCO $PAPEL 192.168.15.0/24 scram-sha-256"
fi

passo "Pronto"

if [[ -n "$SENHA" ]]; then
  cat <<FIM
Cole no .env do LICITA+ (/srv/apps-fase1/licita-mais/.env):

  DATABASE_URL=postgresql://${PAPEL}:${SENHA}@${IP_PG}:5432/${BANCO}?schema=public

$(amarelo "Esta senha aparece uma vez só. Guarde-a agora.")
FIM
else
  cat <<FIM
O papel já existia, então a senha não foi trocada. A DATABASE_URL tem
esta forma — a senha é a que você já guardou:

  DATABASE_URL=postgresql://${PAPEL}:<senha>@${IP_PG}:5432/${BANCO}?schema=public

Se ela se perdeu, defina outra (isto derruba quem estiver usando a antiga):

  pct exec ${CT_PG} -- su postgres -c "psql -tAc \\"ALTER ROLE ${PAPEL} WITH PASSWORD 'nova'\\""
FIM
fi

cat <<FIM

Depois disso, ainda no host thor:

  1. Complete o .env         nano /srv/apps-fase1/licita-mais/.env
     (DATABASE_URL acima, JWT_SECRET, SMTP_USER e SMTP_PASS)

  2. Suba a aplicação        /srv/apps-fase1/licita-mais/deploy-thor.sh
     (a migração roda sozinha na subida do container)

  3. Primeira varredura      pct exec 103 -- bash -c \\
       'cd /opt/licita-mais && docker compose exec -T licita-api \\
        node dist/tarefas/ingestao.js'

Sem o passo 3 o painel fica vazio até a rotina das 5h.
FIM
