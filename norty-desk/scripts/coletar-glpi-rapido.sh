#!/usr/bin/env bash
# As duas perguntas que decidem a ordem das fases 6 a 8 do Norty Desk.
# Rode no host thor, como root.  SOMENTE LEITURA: só SELECT.
set -uo pipefail

CT="${CT:-}"
CTS="${CTS:-100 101 102 103 104 105 106 107 108}"

# 1. Onde está o GLPI --------------------------------------------------
if [ -z "$CT" ]; then
  for ct in $CTS; do
    pct status "$ct" 2>/dev/null | grep -q running || continue
    if pct exec "$ct" -- sh -c \
      "docker ps --format '{{.Names}}' 2>/dev/null | grep -qi glpi \
       || [ -d /var/www/glpi ] || [ -d /opt/glpi ] || [ -d /srv/glpi ]" 2>/dev/null; then
      CT="$ct"; break
    fi
  done
fi
[ -z "$CT" ] && { echo "GLPI não encontrado nos CTs $CTS. Rode com CT=<numero>."; exit 1; }
echo "GLPI no CT $CT"
pct exec "$CT" -- sh -c "docker ps --format '  {{.Names}}\t{{.Image}}'" 2>/dev/null

# 2. Direto no CT ou dentro de um container? ---------------------------
GLPI_CTR=$(pct exec "$CT" -- sh -c \
  "docker ps --format '{{.Names}}' 2>/dev/null | grep -i glpi | head -1" 2>/dev/null)

if [ -n "$GLPI_CTR" ]; then
  echo "container do GLPI: $GLPI_CTR"
  glpi() { pct exec "$CT" -- docker exec "$GLPI_CTR" sh -c "$1" 2>/dev/null; }
else
  glpi() { pct exec "$CT" -- sh -c "$1" 2>/dev/null; }
fi

# 3. Credenciais -------------------------------------------------------
# A extração é gulosa até a última aspa antes do `;`: senha com aspa
# dentro truncava no meio e o resto do script ia falhar sem dizer por quê.
campo() {
  glpi "grep -E '$1' '$CONFIG' 2>/dev/null" \
    | sed -E "s/^[^']*'(.*)'[[:space:]]*;.*\$/\1/" | head -1
}

CONFIG=$(glpi "find / -name config_db.php -not -path '*/node_modules/*' 2>/dev/null | head -1")
if [ -n "$CONFIG" ]; then
  echo "config: $CONFIG"
  DB_HOST=$(campo 'dbhost'); DB_USER=$(campo 'dbuser')
  DB_PASS=$(campo 'dbpassword'); DB_NAME=$(campo 'dbdefault')
else
  echo "config_db.php não encontrado — exporte DB_HOST, DB_USER, DB_PASS e DB_NAME."
fi

: "${DB_HOST:=localhost}"
: "${DB_USER:?defina DB_USER}"; : "${DB_PASS:?defina DB_PASS}"; : "${DB_NAME:?defina DB_NAME}"
echo "banco: $DB_USER@$DB_HOST/$DB_NAME"

# A senha vai por MYSQL_PWD, nunca em `-p`: em `-p` ela aparece no `ps`
# de qualquer um logado na máquina. O escape cobre aspa simples dentro.
PW=${DB_PASS//\'/\'\\\'\'}

# 4. Quem tem o cliente mysql? ----------------------------------------
# A imagem do GLPI muitas vezes não traz o cliente; o banco costuma ser
# outro container. Descobre uma vez, em vez de falhar dezoito vezes.
DB_CTR=$(pct exec "$CT" -- sh -c \
  "docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'maria|mysql|db' | head -1" 2>/dev/null)

if glpi "command -v mysql >/dev/null 2>&1"; then
  via="container do GLPI"
  rodar() { glpi "MYSQL_PWD='$PW' mysql -h '$DB_HOST' -u '$DB_USER' '$DB_NAME' $2 -e \"$1\""; }
elif [ -n "$DB_CTR" ]; then
  via="container do banco ($DB_CTR)"
  rodar() { pct exec "$CT" -- docker exec "$DB_CTR" sh -c \
    "MYSQL_PWD='$PW' mysql -u '$DB_USER' '$DB_NAME' $2 -e \"$1\"" 2>/dev/null; }
elif pct exec "$CT" -- sh -c "command -v mysql >/dev/null 2>&1"; then
  via="CT $CT"
  rodar() { pct exec "$CT" -- sh -c \
    "MYSQL_PWD='$PW' mysql -h '$DB_HOST' -u '$DB_USER' '$DB_NAME' $2 -e \"$1\"" 2>/dev/null; }
else
  echo "Nenhum cliente mysql encontrado no CT nem nos containers."; exit 1
fi
echo "consultando pelo: $via"

sql()  { rodar "$1" "-t"; }
bruto() { rodar "$1" "-N -B"; }

# 5. Contar só o que existe nesta versão -------------------------------
contar() {
  local titulo="$1"; shift
  local lista="" t uniao="" existentes
  for t in "$@"; do lista="${lista}${lista:+, }'$t'"; done

  existentes=$(bruto "SELECT table_name FROM information_schema.tables \
    WHERE table_schema = '$DB_NAME' AND table_name IN ($lista);")

  printf '\n== %s\n' "$titulo"
  [ -z "$existentes" ] && { echo "(nenhuma destas tabelas existe)"; return; }

  for t in $existentes; do
    uniao="${uniao}${uniao:+ UNION ALL }SELECT '$t' AS tabela, COUNT(*) AS linhas FROM \`$t\`"
  done
  sql "$uniao ORDER BY linhas DESC;"
  for t in "$@"; do echo "$existentes" | grep -qx "$t" || echo "  ausente: $t"; done
}

sql "SELECT value AS versao_glpi FROM glpi_configs WHERE name='version';"

contar "FASE 6 — software e licenças" \
  glpi_softwares glpi_softwareversions glpi_softwarelicenses glpi_items_softwareversions
contar "FASE 6 — consumíveis e cartuchos" \
  glpi_consumableitems glpi_consumables glpi_cartridgeitems glpi_cartridges
contar "FASE 6 — rede" \
  glpi_networkports glpi_ipaddresses glpi_ipnetworks glpi_vlans glpi_networkequipments
contar "FASE 7 — datacenter" \
  glpi_racks glpi_datacenters glpi_dcrooms glpi_pdus glpi_enclosures glpi_cables
contar "FASE 8 — projetos e reservas" \
  glpi_projects glpi_projecttasks glpi_reservations glpi_reservationitems
contar "Referência — ativos já cobertos pela Fase 5" \
  glpi_computers glpi_monitors glpi_printers glpi_phones glpi_peripherals

# A pergunta não é se a tabela existe, é se chegou dado esta semana.
printf '\n== O inventário automático ainda roda?\n'
sql "SELECT COUNT(*) AS agentes, \
     SUM(last_contact > DATE_SUB(NOW(), INTERVAL 7 DAY)) AS ativos_7d, \
     MAX(last_contact) AS contato_mais_recente FROM glpi_agents;"

printf '\nPode colar esta saída inteira: nenhuma senha foi impressa.\n'
