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
# 4. As áreas que decidem a ordem das fases 5 a 8
# ---------------------------------------------------------------------
#
# O roadmap (docs/10-roadmap.md, "Sobre a ordem") condiciona a ordem das
# fases ao que a base real tem: se `glpi_racks` estiver vazia, a Fase 7
# é cadastro que ninguém vai preencher. Contar aqui é o que transforma
# essa suposição em número.
#
# As tabelas mudam de versão para versão do GLPI, e uma que não existe
# aborta a consulta inteira. Por isso o COUNT sai montado a partir do
# que o `information_schema` diz que existe: o que não está lá aparece
# como ausente, não como erro.

# Consulta sem moldura, uma linha por registro — para ler em bash.
consulta_bruta() {
  pct exec "$CT" -- sh -c \
    "mysql -h '$DB_HOST' -u '$DB_USER' -p'$DB_PASS' '$DB_NAME' -N -B -e \"$1\"" \
    2>/dev/null
}

contar_area() {
  local titulo="$1"; shift
  local candidatas="$*"

  # A lista entre aspas é montada aqui, e não dentro da string SQL: a
  # primeira versão usava `printf` dentro de três níveis de aspas e saía
  # `IN ("tabela,""outra,")` — aspas duplas dobradas e vírgula sobrando,
  # que no MySQL não casa com nada. Toda área aparecia como inexistente,
  # sem erro nenhum na tela.
  local lista=""
  local t
  for t in $candidatas; do
    lista="${lista}${lista:+, }'$t'"
  done

  local existentes
  existentes=$(consulta_bruta "SELECT table_name FROM information_schema.tables \
    WHERE table_schema = '$DB_NAME' AND table_name IN ($lista);")

  printf '\n-- %s\n' "$titulo"

  if [ -z "$existentes" ]; then
    echo "(nenhuma destas tabelas existe nesta versão do GLPI)"
    for t in $candidatas; do echo "  ausente: $t"; done
    return
  fi

  local uniao=""
  for t in $existentes; do
    uniao="${uniao}${uniao:+ UNION ALL }SELECT '$t' AS tabela, COUNT(*) AS linhas FROM \`$t\`"
  done
  consulta "$uniao ORDER BY linhas DESC;"

  # O que foi pedido e não existe também é resposta.
  for t in $candidatas; do
    echo "$existentes" | grep -qx "$t" || echo "  ausente: $t"
  done
}

log "Fase 5 — ativos e componentes (confere o que já foi construído)"
{
  contar_area "Ativos por tipo" \
    glpi_computers glpi_monitors glpi_printers glpi_phones \
    glpi_peripherals glpi_networkequipments
  contar_area "Catálogo do ativo" \
    glpi_locations glpi_manufacturers glpi_computermodels glpi_monitormodels \
    glpi_printermodels glpi_phonemodels glpi_peripheralmodels \
    glpi_networkequipmentmodels glpi_states
  contar_area "Componentes instalados" \
    glpi_items_deviceprocessors glpi_items_devicememories \
    glpi_items_deviceharddrives glpi_items_devicenetworkcards \
    glpi_items_devicegraphiccards glpi_items_devicemotherboards \
    glpi_items_devicepowersupplies glpi_items_devicebatteries \
    glpi_items_devicesimcards glpi_items_devicefirmwares
} | tee "$SAIDA/08-fase5-ativos.txt"

log "Fase 6 — software, licenças, consumíveis e rede"
{
  contar_area "Software e licenças" \
    glpi_softwares glpi_softwareversions glpi_softwarelicenses \
    glpi_items_softwareversions glpi_items_softwarelicenses \
    glpi_softwarecategories
  contar_area "Consumíveis e cartuchos" \
    glpi_consumableitems glpi_consumables glpi_cartridgeitems glpi_cartridges
  contar_area "Rede" \
    glpi_networkports glpi_networkportethernets glpi_networknames \
    glpi_ipaddresses glpi_ipnetworks glpi_vlans glpi_wifinetworks \
    glpi_networkaliases glpi_fqdns
} | tee "$SAIDA/09-fase6.txt"

log "Fase 7 — datacenter"
{
  contar_area "Rack, sala, PDU e cabo" \
    glpi_racks glpi_datacenters glpi_dcrooms glpi_pdus glpi_enclosures \
    glpi_cables glpi_items_racks glpi_passivedcequipments
} | tee "$SAIDA/10-fase7-datacenter.txt"

# Se o agente continuar mandando dado, a Fase 7 é receber o que ele
# manda; se parou, é cadastro manual — e o desenho muda.
log "Fase 7 — o inventário automático ainda roda?"
{
  contar_area "Agentes e regras de importação" \
    glpi_agents glpi_agenttypes glpi_rulematchedlogs glpi_unmanageds \
    glpi_refusedequipments glpi_lockedfields
  consulta "SELECT name, value FROM glpi_configs
            WHERE context='inventory' OR name LIKE '%inventory%';"
  # A pergunta real não é se a tabela existe, é se chegou dado esta
  # semana. Um agente que parou em 2023 é cadastro manual disfarçado.
  consulta "SELECT id, name, last_contact,
                   DATEDIFF(NOW(), last_contact) AS dias_sem_falar
            FROM glpi_agents
            ORDER BY last_contact DESC LIMIT 20;"
  consulta "SELECT COUNT(*) AS agentes_ativos_7d FROM glpi_agents
            WHERE last_contact > DATE_SUB(NOW(), INTERVAL 7 DAY);"
} | tee "$SAIDA/11-fase7-inventario.txt"

log "Fase 8 — projetos e reservas"
{
  contar_area "Projetos e reservas" \
    glpi_projects glpi_projecttasks glpi_projectstates \
    glpi_reservationitems glpi_reservations glpi_contracts glpi_suppliers \
    glpi_budgets glpi_infocoms glpi_ticketcosts
} | tee "$SAIDA/12-fase8.txt"

# ---------------------------------------------------------------------
log "Empacotando"
tar -czf "$SAIDA.tar.gz" -C "$(dirname "$SAIDA")" "$(basename "$SAIDA")"

cat <<FIM

Pronto.

  Pacote:  $SAIDA.tar.gz

As duas perguntas que decidem a ordem das fases 5 a 8
(docs/10-roadmap.md, "Sobre a ordem"):

  1. O que a base tem      → 09-fase6.txt e 10-fase7-datacenter.txt
     Área com zero linha é cadastro que ninguém vai preencher.

  2. De onde vem o dado    → 11-fase7-inventario.txt
     Olhe `agentes_ativos_7d`. Zero significa que o agente parou, e a
     Fase 7 vira cadastro manual — o que muda o desenho dela.

O script leu a senha do banco do config_db.php mas NÃO a gravou nos
arquivos. Confirme antes de enviar:

  grep -rniE 'password|senha|secret' "$SAIDA/"

FIM
