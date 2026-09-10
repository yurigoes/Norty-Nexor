#!/usr/bin/env bash
# Onde mora o desk.norty.com.br NESTA máquina.
# Serve para VPS comum (sem Proxmox) e para host com LXC.
# SOMENTE LEITURA: não altera nada.
set -uo pipefail

ALVO="${ALVO:-desk.norty.com.br}"
T="${T:-15}"
titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
tem() { command -v "$1" >/dev/null 2>&1; }

titulo "Esta máquina"
hostname; hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' | sed 's/^/  ip: /'

titulo "Para onde $ALVO resolve"
if tem dig; then dig +short "$ALVO" | sed 's/^/  /'
elif tem host; then host "$ALVO" 2>/dev/null | sed 's/^/  /'
else getent hosts "$ALVO" | sed 's/^/  /'; fi
echo "  (compare com os IPs acima: se bater, o domínio aponta para cá)"

titulo "Configuração que cita $ALVO"
# Por nome de arquivo e com poda: `grep -r` em /srv e /opt varre
# node_modules e volume de Docker, e trava.
timeout "$T" sh -c "find /etc /srv /opt /root /home /var/www -maxdepth 6 \
  \\( -name node_modules -o -name .git -o -name vendor -o -name dist \\) -prune -o \
  -type f \\( -name 'Caddyfile' -o -name '*.caddy' -o -name '*.conf' -o -name '*.vhost' \
     -o -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' \
     -o -name 'compose*.yml' -o -name 'compose*.yaml' -o -name '*.env' \\) -print 2>/dev/null \
  | head -400 | xargs -r grep -lI '$ALVO' 2>/dev/null | head -20" \
  || echo "  (nada, ou passou de ${T}s)"

titulo "Cloudflare Tunnel — o domínio está atrás da Cloudflare"
# `desk.norty.com.br` resolve para faixa da Cloudflare (2606:4700:...),
# então o DNS não entrega a origem: quem sabe o caminho é a configuração
# do túnel, que lista os hostnames que ele atende.
cf=$(timeout "$T" find /etc/cloudflared /root/.cloudflared /srv /opt -maxdepth 6 \
      \( -name node_modules -o -name .git \) -prune -o \
      -type f \( -name 'config.yml' -o -name 'config.yaml' -o -name '*.json' \) -print 2>/dev/null \
     | head -100 | xargs -r grep -lI 'ingress\|tunnel\|cloudflare' 2>/dev/null | head -10)
if [ -n "$cf" ]; then
  printf '  %s\n' $cf
  echo "  --- hostnames citados nesses arquivos ---"
  printf '%s\n' $cf | xargs -r grep -hoE '[a-z0-9.-]+\.norty\.com\.br' 2>/dev/null | sort -u | sed 's/^/    /'
else
  echo "  (nenhuma configuração de túnel encontrada aqui)"
fi
if tem docker; then
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null | grep -i cloudflared); do
    echo "  container $c:"
    docker inspect "$c" --format '{{json .Config.Cmd}} {{json .Config.Env}}' 2>/dev/null \
      | tr ',' '\n' | grep -iE 'tunnel|token|hostname' | sed 's/TOKEN=[^"]*/TOKEN=(oculto)/' | sed 's/^/    /'
  done
fi

titulo "Containers Docker"
if tem docker; then
  docker ps -a --format '  {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null \
    || echo "  (docker presente mas sem permissão/daemon)"
else
  echo "  (sem docker nesta máquina)"
fi

titulo "Quem escuta em portas de web"
# Sem filtro por espaço no fim: o formato do ss varia e o filtro
# estrito devolvia vazio mesmo com serviço no ar.
if tem ss; then ss -lntp 2>/dev/null | grep -E ':(80|443|3000|3061|5174|8080)\b' | sed 's/^/  /'
elif tem netstat; then netstat -lntp 2>/dev/null | grep -E ':(80|443|3000|3061|5174|8080)\b' | sed 's/^/  /'
else echo "  (sem ss nem netstat)"; fi

titulo "Sobrou GLPI aqui?"
# Capturado antes de testar: com `pipefail`, o `timeout` matando o
# `find` devolve 124 e o `||` disparava mesmo tendo achado alguma coisa
# — a saída trazia o caminho E "(nenhum)" logo abaixo.
glpi_achado=$( {
  ls -d /var/www/glpi /opt/glpi /srv/glpi /var/www/html/glpi 2>/dev/null
  tem docker && docker ps -a --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -i glpi
  timeout "$T" find / -maxdepth 6 -name config_db.php -not -path '*/node_modules/*' 2>/dev/null | head -5
} 2>/dev/null )
if [ -n "$glpi_achado" ]; then printf '%s\n' "$glpi_achado" | sed 's/^/  /'
else echo "  (nenhum)"; fi

titulo "Bancos"
listar() {   # $1 = rótulo   $2 = comando que lista nomes
  local nomes; nomes=$(eval "$2" 2>/dev/null)
  local n
  for n in $nomes; do
    case "$n" in
      *[Gg][Ll][Pp][Ii]*) echo "  [GLPI — legado] $1: $n";;
      *desk*|*Desk*|*nortydesk*) echo "  [DESK — nosso]  $1: $n";;
      *) echo "  (outra app)      $1: $n";;
    esac
  done
}
tem mysql && listar "mysql local" \
  "mysql -N -B -e 'SHOW DATABASES;' | grep -ivE '^(information_schema|performance_schema|mysql|sys)\$'"
tem psql && listar "postgres local" \
  "psql -U postgres -tAc 'SELECT datname FROM pg_database WHERE NOT datistemplate;' | grep -v '^postgres\$'"

if tem docker; then
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'maria|mysql|postgres|pg|db'); do
    listar "$c (mysql)" "docker exec '$c' sh -c \"mysql -N -B -e 'SHOW DATABASES;'\" | grep -ivE '^(information_schema|performance_schema|mysql|sys)\$'"
    listar "$c (postgres)" "docker exec '$c' sh -c \"psql -U postgres -tAc 'SELECT datname FROM pg_database WHERE NOT datistemplate;'\" | grep -v '^postgres\$'"
  done
fi

printf '\nFim. Nenhuma senha foi impressa — pode colar a saída inteira.\n'
