#!/usr/bin/env bash
# Onde mora o desk.norty.com.br?  Rode no host thor, como root.
# SOMENTE LEITURA. Cada chamada tem timeout: um container travado não
# trava o levantamento inteiro.
set -uo pipefail

ALVO="${ALVO:-desk.norty.com.br}"
T="${T:-15}"                     # timeout por chamada, em segundos
titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# `grep -r` em /srv e /opt varre node_modules, .git e volume de Docker —
# foi o que travou a primeira versão. Aqui a busca é por NOME de arquivo,
# com profundidade limitada, e só então o grep entra nos que casaram.
# `grep -r` em /srv e /opt varre node_modules, .git e volume de Docker —
# foi o que travou a primeira versão. Aqui a busca é por NOME de arquivo,
# com profundidade limitada, podando o que não é configuração; só os
# arquivos que casaram é que passam pelo grep.
BUSCA="find /etc/caddy /etc/nginx /etc/apache2 /etc/traefik /srv /opt /root \
  -maxdepth 6 \
  \\( -name node_modules -o -name .git -o -name vendor -o -name dist \\) -prune -o \
  -type f \\( -name 'Caddyfile' -o -name '*.caddy' -o -name '*.conf' \
     -o -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' \
     -o -name 'compose*.yml' -o -name 'compose*.yaml' \\) -print 2>/dev/null \
  | head -300 | xargs -r grep -lI '$ALVO' 2>/dev/null | head -10"

titulo "Containers LXC"
pct list 2>/dev/null
CTS=$(pct list 2>/dev/null | awk 'NR>1 && $2=="running" {print $1}')

titulo "Configuração que cita $ALVO — no host"
timeout "$T" sh -c "$BUSCA" || echo "(nada, ou demorou mais que ${T}s)"

titulo "Configuração que cita $ALVO — por container"
for ct in $CTS; do
  achados=$(timeout "$T" pct exec "$ct" -- sh -c "$BUSCA" 2>/dev/null)
  [ -n "$achados" ] && { echo "CT $ct ($(pct config "$ct" 2>/dev/null | awk -F': ' '/^hostname/{print $2}')):";
                         printf '  %s\n' $achados; }
done

titulo "Containers Docker, por CT"
for ct in $CTS; do
  s=$(timeout "$T" pct exec "$ct" -- sh -c \
    "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null" 2>/dev/null)
  [ -n "$s" ] && { echo "CT $ct:"; printf '%s\n' "$s" | sed 's/^/  /'; }
done

titulo "Quem escuta em 80/443, por CT"
for ct in $CTS; do
  s=$(timeout "$T" pct exec "$ct" -- sh -c \
    "(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) | grep -E ':(80|443) '" 2>/dev/null)
  [ -n "$s" ] && { echo "CT $ct:"; printf '%s\n' "$s" | sed 's/^/  /'; }
done

titulo "Sobrou instalação do GLPI?"
achou_glpi=""
for ct in $CTS; do
  s=$(timeout "$T" pct exec "$ct" -- sh -c \
    "ls -d /var/www/glpi /opt/glpi /srv/glpi /var/www/html/glpi 2>/dev/null; \
     docker ps -a --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -i glpi" 2>/dev/null)
  [ -n "$s" ] && { echo "CT $ct:"; printf '%s\n' "$s" | sed 's/^/  /'; achou_glpi=1; }
done
[ -z "$achou_glpi" ] && echo "(nenhuma)"

titulo "Bancos existentes"
# Marcar de [Desk] tudo que não é GLPI foi uma bobagem da primeira
# versão: num host com quinze aplicações, `visualstock` e `festou`
# apareciam como se fossem nossos. Só o que casa com o nome é rotulado;
# o resto é o que é — banco de outra aplicação.
rotular() {
  local onde="$1" n
  for n in $2; do
    case "$n" in
      *[Gg][Ll][Pp][Ii]*)                 echo "  [GLPI — legado] $onde: $n";;
      *desk*|*Desk*|*norty_desk*|*nortydesk*) echo "  [DESK — nosso]  $onde: $n";;
      *)                                  echo "  (outra app)      $onde: $n";;
    esac
  done
}
for ct in $CTS; do
  for ctr in $(timeout "$T" pct exec "$ct" -- sh -c \
      "docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'maria|mysql|postgres|pg|db'" 2>/dev/null); do
    m=$(timeout "$T" pct exec "$ct" -- docker exec "$ctr" sh -c \
      "mysql -N -B -e 'SHOW DATABASES;' 2>/dev/null | grep -ivE '^(information_schema|performance_schema|mysql|sys)$'" 2>/dev/null)
    [ -n "$m" ] && rotular "CT $ct/$ctr (mysql)" "$m"
    pg=$(timeout "$T" pct exec "$ct" -- docker exec "$ctr" sh -c \
      "psql -U postgres -tAc 'SELECT datname FROM pg_database WHERE NOT datistemplate;' 2>/dev/null | grep -v '^postgres$'" 2>/dev/null)
    [ -n "$pg" ] && rotular "CT $ct/$ctr (postgres)" "$pg"
  done
done

printf '\nFim. Nenhuma senha foi impressa — pode colar a saída inteira.\n'
