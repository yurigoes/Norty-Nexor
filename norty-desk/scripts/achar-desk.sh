#!/usr/bin/env bash
# Onde mora o desk.norty.com.br, e sobrou alguma base do GLPI?
# Rode no host thor, como root.  SOMENTE LEITURA: não altera nada.
set -uo pipefail

titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ALVO="${ALVO:-desk.norty.com.br}"

titulo "Containers LXC no thor"
pct list 2>/dev/null || echo "(pct não disponível — este host não é Proxmox?)"

CTS=$(pct list 2>/dev/null | awk 'NR>1 && $2=="running" {print $1}')
[ -z "$CTS" ] && CTS="${CTS_FALLBACK:-100 101 102 103 104 105 106 107 108}"

titulo "Quem responde por $ALVO — no proxy do host"
# A regra de ouro diz que o código mora no host em /srv. O proxy que
# resolve o nome costuma estar aqui também.
grep -rIl --exclude-dir=.git "$ALVO" \
  /etc/caddy /etc/nginx /etc/apache2 /etc/traefik /srv /opt \
  2>/dev/null | head -20 \
  || echo "(nada no host)"

titulo "Quem responde por $ALVO — dentro dos containers"
for ct in $CTS; do
  achados=$(pct exec "$ct" -- sh -c \
    "grep -rIl '$ALVO' /etc/caddy /etc/nginx /etc/apache2 /etc/traefik \
       /opt /srv /root 2>/dev/null | head -10" 2>/dev/null)
  [ -n "$achados" ] && { echo "CT $ct:"; printf '  %s\n' $achados; }
done

titulo "Containers Docker, por CT"
for ct in $CTS; do
  saida=$(pct exec "$ct" -- sh -c \
    "docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null" 2>/dev/null)
  [ -n "$saida" ] && { echo "CT $ct:"; printf '%s\n' "$saida" | sed 's/^/  /'; }
done

titulo "Quem escuta em 80/443, por CT"
for ct in $CTS; do
  saida=$(pct exec "$ct" -- sh -c \
    "(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) | grep -E ':(80|443|3061|5174|8080) '" 2>/dev/null)
  [ -n "$saida" ] && { echo "CT $ct:"; printf '%s\n' "$saida" | sed 's/^/  /'; }
done

# A pergunta que ficou em aberto: existe GLPI ainda, em qualquer forma?
titulo "Sobrou alguma instalação do GLPI?"
for ct in $CTS; do
  saida=$(pct exec "$ct" -- sh -c \
    "ls -d /var/www/glpi /opt/glpi /srv/glpi /var/www/html/glpi 2>/dev/null; \
     find / -maxdepth 5 -name config_db.php -not -path '*/node_modules/*' 2>/dev/null | head -3; \
     docker ps -a --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -i glpi" 2>/dev/null)
  [ -n "$saida" ] && { echo "CT $ct:"; printf '%s\n' "$saida" | sed 's/^/  /'; }
done
echo "(vazio acima = nenhuma instalação encontrada)"

# "nortydesk" casa com o filtro `desk`, e apareceria como se fosse base
# do GLPI. Rotular é a diferença entre "sobrou legado" e "é a nossa".
rotular() {
  local onde="$1" nomes="$2" n
  for n in $nomes; do
    case "$n" in
      *[Gg][Ll][Pp][Ii]*) echo "  [GLPI] $onde: $n";;
      *) echo "  [Desk] $onde: $n";;
    esac
  done
}

titulo "Bancos existentes (GLPI e Desk, separados)"
# O GLPI pode ter sumido e o banco ficado — é o banco que interessa
# para a migração, não o PHP.
for ct in $CTS; do
  # MySQL/MariaDB direto no CT
  bancos=$(pct exec "$ct" -- sh -c \
    "mysql -N -B -e 'SHOW DATABASES;' 2>/dev/null | grep -iE 'glpi|desk'" 2>/dev/null)
  [ -n "$bancos" ] && rotular "CT $ct (mysql local)" "$bancos"

  # E dentro de cada container de banco
  for ctr in $(pct exec "$ct" -- sh -c \
      "docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'maria|mysql|postgres|db'" 2>/dev/null); do
    m=$(pct exec "$ct" -- docker exec "$ctr" sh -c \
      "mysql -N -B -e 'SHOW DATABASES;' 2>/dev/null | grep -iE 'glpi|desk'" 2>/dev/null)
    [ -n "$m" ] && rotular "CT $ct / $ctr (mysql)" "$m"
    pg=$(pct exec "$ct" -- docker exec "$ctr" sh -c \
      "psql -U postgres -tAc 'SELECT datname FROM pg_database;' 2>/dev/null | grep -iE 'glpi|desk'" 2>/dev/null)
    [ -n "$pg" ] && rotular "CT $ct / $ctr (postgres)" "$pg"
  done
done
echo "(uma linha [GLPI] acima é base de legado a migrar; [Desk] é a nossa)"

printf '\nPode colar esta saída inteira: nenhuma senha é impressa.\n'
