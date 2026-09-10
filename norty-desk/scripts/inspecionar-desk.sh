#!/usr/bin/env bash
# O que é o norty-desk que está no ar no heimdall?
# SOMENTE LEITURA — e nenhum VALOR de variável de ambiente é impresso:
# só os NOMES das chaves. Segredo não passa por conversa.
set -uo pipefail
titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
RAIZ="${RAIZ:-/opt/norty-desk}"

titulo "O que existe em $RAIZ"
ls -la "$RAIZ" 2>/dev/null | head -30

titulo "É um repositório? De onde veio?"
git -C "$RAIZ" remote -v 2>/dev/null | head -4
git -C "$RAIZ" log --oneline -5 2>/dev/null
git -C "$RAIZ" status -sb 2>/dev/null | head -5
[ -d "$RAIZ/.git" ] || echo "(não é repositório git)"

titulo "Qual é a stack"
for f in package.json composer.json go.mod requirements.txt; do
  [ -f "$RAIZ/$f" ] && { echo "--- $f"; head -40 "$RAIZ/$f"; }
done

titulo "Como sobe (compose)"
for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
  # Mascarar por lista de palavras não bastou: em YAML há espaço depois
  # do `:`, e `DATABASE_URL` não casa com nenhuma palavra de segredo —
  # a senha saía inteira dentro da string de conexão. Agora o padrão é o
  # inverso: **todo** valor de atribuição é ocultado, e o que interessa
  # (imagem, porta, volume) não é atribuição de ambiente.
  [ -f "$RAIZ/$f" ] && { echo "--- $f"; sed -E \
      -e 's#://[^:/@[:space:]]+:[^@[:space:]]+@#://(usuario):(oculto)@#g' \
      -e '/^[[:space:]]*(image|ports|volumes|container_name|restart|build|depends_on|networks|services|command|healthcheck|context|dockerfile|-[[:space:]]*"?[0-9])/!s/^([[:space:]]*-?[[:space:]]*[A-Za-z_][A-Za-z0-9_]*)[[:space:]]*[:=][[:space:]]*[^[:space:]].*$/\1: (oculto)/' \
      "$RAIZ/$f" | head -60; }
done

titulo "Chaves do .env — NOMES apenas, nunca os valores"
if [ -f "$RAIZ/.env" ]; then
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$RAIZ/.env" | sort -u | sed 's/^/  /'
  echo "  ($(grep -c . "$RAIZ/.env" 2>/dev/null) linhas no total)"
  # A única coisa que interessa do valor é para onde o domínio aponta.
  echo "  --- linhas que citam o domínio, com o valor mascarado ---"
  grep -iE 'desk\.norty\.com\.br' "$RAIZ/.env" \
    | sed -E 's/=(.*)$/=(valor oculto — cita o domínio)/' | sed 's/^/  /'
else
  echo "  (sem .env em $RAIZ)"
fi

titulo "Onde o Caddy manda o desk.norty.com.br"
for f in /opt/norty-mail/Caddyfile /opt/norty-desk/Caddyfile /etc/caddy/Caddyfile; do
  [ -f "$f" ] && { echo "--- $f"; \
    awk '/desk\.norty\.com\.br/{p=1} p{print} p&&/^\}/{p=0}' "$f" | head -25; }
done

titulo "O container norty-desk"
docker inspect norty-desk --format '  imagem: {{.Config.Image}}
  criado: {{.Created}}
  comando: {{json .Config.Cmd}}
  volumes: {{range .Mounts}}{{.Source}} -> {{.Destination}}  {{end}}' 2>/dev/null
echo "  --- chaves de ambiente do container (nomes apenas) ---"
docker inspect norty-desk --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | cut -d= -f1 | sort -u | sed 's/^/    /'

titulo "Onde estão os dados"
# Descobre o banco pelo nome da chave, sem revelar a string de conexão.
if [ -f "$RAIZ/.env" ]; then
  grep -oE '^(DATABASE_URL|DB_[A-Z_]*|POSTGRES_[A-Z_]*|MYSQL_[A-Z_]*)' "$RAIZ/.env" \
    | sort -u | sed 's/^/  chave: /'
  motor=$(grep -oiE 'postgres|mysql|mariadb|sqlite' "$RAIZ/.env" | head -1)
  [ -n "$motor" ] && echo "  motor aparente: $motor"
fi
find "$RAIZ" -maxdepth 3 -name '*.sqlite*' -o -maxdepth 3 -name '*.db' 2>/dev/null | head -5 | sed 's/^/  arquivo: /'

printf '\nFim. Nenhum valor de segredo foi impresso.\n'
