#!/usr/bin/env bash
#
# Norty Car — sobe a APRESENTAÇÃO numa máquina com Docker, num comando.
#
#   ./scripts/norty-car/apresentacao.sh                       endereço temporário *.trycloudflare.com
#   CLOUDFLARE_TUNNEL_TOKEN=xxx APP_HOST=car.exemplo.com \
#     ./scripts/norty-car/apresentacao.sh                      usa o seu túnel e o seu domínio
#   ./scripts/norty-car/apresentacao.sh --parar               derruba (os dados ficam no volume)
#
# Cria banco próprio, a empresa Araújo Veículos com frota e site publicado e
# a conta demo@nortycar.test (senha 1234) que troca de perfil pelo menu.
# Idempotente: rodar de novo atualiza o código sem perder os dados.

set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$RAIZ/infra/norty-car/apresentacao"
ENV_FILE="$DIR/.env"

azul()    { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
erro()    { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
trap 'erro "Falhou na linha $LINENO. Corrija e rode de novo."' ERR

command -v docker >/dev/null || { erro "Docker não encontrado. Instale com: curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { erro "Falta o plugin docker compose."; exit 1; }
COMPOSE="docker compose -f $DIR/docker-compose.yml --env-file $ENV_FILE"

if [[ "${1:-}" == "--parar" ]]; then $COMPOSE down; exit 0; fi

azul "1/5 · Configuração"
if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  cat > "$ENV_FILE" <<EOF
DB_ADMIN_PASSWORD=$(openssl rand -hex 24)
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
SECRETS_KEY=$(openssl rand -hex 32)
WEB_PORT=3070
DEMO_LOGIN_PASSWORD=1234
CLOUDFLARE_TUNNEL_TOKEN=
APP_HOSTS=localhost
APP_URL=
EOF
  verde "  infra/norty-car/apresentacao/.env criado com segredos novos."
fi
# Token e domínio podem vir pelo ambiente; ficam gravados para a próxima vez.
definir() { sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; }
[[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]] && definir CLOUDFLARE_TUNNEL_TOKEN "$CLOUDFLARE_TUNNEL_TOKEN"
if [[ -n "${APP_HOST:-}" ]]; then definir APP_HOSTS "$APP_HOST"; definir APP_URL "https://$APP_HOST"; fi

azul "2/5 · Construindo as imagens (a primeira vez leva alguns minutos)"
$COMPOSE build --pull

azul "3/5 · Banco e migrações"
$COMPOSE up -d --wait db
$COMPOSE run --rm --entrypoint sh api -c 'npx prisma migrate deploy'

azul "4/5 · Planos, empresa Araújo Veículos e conta de apresentação"
$COMPOSE run --rm --entrypoint sh api -c 'npx tsx prisma/seed.ts && npx tsx prisma/apresentacao.ts'

azul "5/5 · Subindo aplicativo e túnel"
$COMPOSE up -d
WEB_PORT="$(grep -E '^WEB_PORT=' "$ENV_FILE" | cut -d= -f2)"
printf '  Aguardando a API'
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:${WEB_PORT:-3070}/v1/health" >/dev/null 2>&1 && break
  printf '.'; sleep 2
done
printf '\n'
curl -sf "http://127.0.0.1:${WEB_PORT:-3070}/v1/health" >/dev/null || { amarelo "A API não respondeu. Veja: $COMPOSE logs --tail=80 api"; exit 1; }

URL="$(grep -E '^APP_URL=' "$ENV_FILE" | cut -d= -f2)"
if [[ -z "$(grep -E '^CLOUDFLARE_TUNNEL_TOKEN=.+' "$ENV_FILE" || true)" ]]; then
  for _ in $(seq 1 30); do
    URL="$($COMPOSE logs tunnel 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
    [[ -n "$URL" ]] && break; sleep 2
  done
fi

verde "Norty Car (apresentação) no ar."
echo "  Na rede local:  http://localhost:${WEB_PORT:-3070}  (ou http://<ip-desta-máquina>:${WEB_PORT:-3070})"
[[ -n "$URL" ]] && echo "  Link público:   $URL" || amarelo "  Túnel: confira com  $COMPOSE logs tunnel"
echo "  Site da locadora: <endereço>/site/araujo-veiculos"
echo "  Login: demo@nortycar.test  ·  senha: $(grep -E '^DEMO_LOGIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2)"
echo "  Troca de perfil: menu do usuário → Modo apresentação — ver como"
