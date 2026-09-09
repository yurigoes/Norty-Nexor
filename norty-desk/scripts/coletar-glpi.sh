#!/usr/bin/env bash
#
# Levanta a base real do GLPI para fechar o plano de migração
# (docs/09-migracao.md, seção 1).
#
# Rode NO HOST thor, como root:
#     CT=<numero> bash coletar-glpi.sh
#
# Se não passar CT, procura o GLPI nos containers. É SOMENTE LEITURA:
# só SELECT, nada de escrita.

set -uo pipefail

SAIDA="/tmp/glpi-inventario-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SAIDA"
CTS="${CTS:-100 101 102 103 104 105 106 107}"

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------
# 1. Achar o GLPI
# ---------------------------------------------------------------------
CT="${CT:-}"

if [ -z "$CT" ]; then
  log "Procurando o GLPI"
  for ct in $CTS; do
    pct status "$ct" 2>/dev/null | grep -q running || continue
    if pct exec "$ct" -- sh -c \
      "docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -qi glpi \
       || [ -d /opt/glpi ] || [ -d /srv/glpi ] || [ -d /var/www/glpi ]" 2>/dev/null; then
      CT="$ct"
      echo "GLPI encontrado no CT $CT"
      break
    fi
  done
fi

if [ -z "$CT" ]; then
  echo "Não achei o GLPI. Rode com o container certo:  CT=105 bash $0"
  exit 1
fi

pct exec "$CT" -- sh -c \
  "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null" \
  2>&1 | tee "$SAIDA/00-containers.txt"

# ---------------------------------------------------------------------
# 2. Credenciais do banco, direto do config do GLPI
# ---------------------------------------------------------------------
log "Localizando config_db.php"
CONFIG=$(pct exec "$CT" -- sh -c \
  "find / -name config_db.php -not -path '*/node_modules/*' 2>/dev/null | head -1")

if [ -z "$CONFIG" ]; then
  cat <<'FIM'
Não achei config_db.php no filesystem do CT. Se o GLPI roda em Docker,
o arquivo está dentro do container. Descubra o nome e rode:

  pct exec <CT> -- docker exec <container-glpi> \
    find / -name config_db.php 2>/dev/null

Depois exporte DB_HOST, DB_USER, DB_PASS e DB_NAME e rode este script
de novo.
FIM
  [ -z "${DB_NAME:-}" ] && exit 1
fi

if [ -n "$CONFIG" ]; then
  echo "config: $CONFIG"
  eval "$(pct exec "$CT" -- sh -c "
    grep -oE \"\\\$db(host|user|password|default)\\s*=\\s*'[^']*'\" '$CONFIG' 2>/dev/null \
    | sed -E \"s/\\\\\$dbhost\\s*=\\s*'([^']*)'/DB_HOST='\\1'/;
               s/\\\\\$dbuser\\s*=\\s*'([^']*)'/DB_USER='\\1'/;
               s/\\\\\$dbpassword\\s*=\\s*'([^']*)'/DB_PASS='\\1'/;
               s/\\\\\$dbdefault\\s*=\\s*'([^']*)'/DB_NAME='\\1'/\"
  " 2>/dev/null)"
fi

: "${DB_HOST:=localhost}"
: "${DB_USER:?defina DB_USER}"
: "${DB_PASS:?defina DB_PASS}"
: "${DB_NAME:?defina DB_NAME}"

echo "banco: $DB_USER@$DB_HOST/$DB_NAME"

consulta() {
  pct exec "$CT" -- sh -c \
    "mysql -h '$DB_HOST' -u '$DB_USER' -p'$DB_PASS' '$DB_NAME' -t -e \"$1\"" 2>&1
}

# ---------------------------------------------------------------------
# 3. O levantamento
# ---------------------------------------------------------------------
log "Versão e volume"
{
  consulta "SELECT value AS versao FROM glpi_configs WHERE name='version';"
  consulta "SELECT
     (SELECT COUNT(*) FROM glpi_tickets)                      AS chamados_total,
     (SELECT COUNT(*) FROM glpi_tickets WHERE is_deleted=0)   AS chamados_vivos,
     (SELECT COUNT(*) FROM glpi_itilfollowups)                AS acompanhamentos,
     (SELECT COUNT(*) FROM glpi_tickettasks)                  AS tarefas,
     (SELECT COUNT(*) FROM glpi_itilsolutions)                AS solucoes,
     (SELECT COUNT(*) FROM glpi_documents)                    AS documentos,
     (SELECT COUNT(*) FROM glpi_users WHERE is_active=1)      AS usuarios_ativos;"
} | tee "$SAIDA/01-volume.txt"

# A árvore de entidades decide se a migração para organização plana é
# direta ou se precisa de decisão caso a caso (docs/09-migracao.md, §1).
log "Entidades — a resposta mais importante"
consulta "SELECT id, name, level, completename FROM glpi_entities ORDER BY level, name;" \
  | tee "$SAIDA/02-entidades.txt"

log "Perfis em uso (para o mapa de RBAC)"
consulta "SELECT p.id, p.name, COUNT(pu.id) AS usuarios
          FROM glpi_profiles p
          LEFT JOIN glpi_profiles_users pu ON pu.profiles_id = p.id
          GROUP BY p.id, p.name ORDER BY usuarios DESC;" \
  | tee "$SAIDA/03-perfis.txt"

log "Estrutura de serviço"
{
  consulta "SELECT COUNT(*) AS categorias FROM glpi_itilcategories;"
  consulta "SELECT id, name, type, number_time, definition_time FROM glpi_slas;"
  consulta "SELECT id, name, type, number_time, definition_time FROM glpi_olas;"
  consulta "SELECT id, name FROM glpi_calendars;"
  consulta "SELECT COUNT(*) AS artigos FROM glpi_knowbaseitems;"
  consulta "SELECT id, name, is_active FROM glpi_mailcollectors;"
} | tee "$SAIDA/04-servico.txt"

log "Distribuição de status e tipo"
consulta "SELECT status, type, COUNT(*) AS qtd FROM glpi_tickets
          WHERE is_deleted=0 GROUP BY status, type ORDER BY qtd DESC;" \
  | tee "$SAIDA/05-distribuicao.txt"

log "Plugins (esquema fora do padrão)"
consulta "SELECT directory, name, version, state FROM glpi_plugins;" \
  | tee "$SAIDA/06-plugins.txt"

log "Volume por ano (dimensiona a janela de migração)"
consulta "SELECT YEAR(date) AS ano, COUNT(*) AS chamados FROM glpi_tickets
          WHERE is_deleted=0 GROUP BY ano ORDER BY ano;" \
  | tee "$SAIDA/07-por-ano.txt"

# ---------------------------------------------------------------------
log "Empacotando"
tar -czf "$SAIDA.tar.gz" -C "$(dirname "$SAIDA")" "$(basename "$SAIDA")"

cat <<FIM

Pronto.

  Pacote:  $SAIDA.tar.gz

O script leu a senha do banco do config_db.php mas NÃO a gravou nos
arquivos. Confirme antes de enviar:

  grep -rniE 'password|senha|secret' "$SAIDA/"

FIM
