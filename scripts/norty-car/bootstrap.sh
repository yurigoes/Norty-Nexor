#!/usr/bin/env bash
#
# Norty Car — instala e atualiza a stack de produção.
#
#   ./scripts/norty-car/bootstrap.sh                  sobe ou atualiza
#   ./scripts/norty-car/bootstrap.sh --custom-domains sobe também o Caddy (domínios próprios)
#
# Idempotente: migrações e seed podem rodar quantas vezes for preciso,
# então o mesmo script serve para o primeiro deploy e para cada versão.
# Precisa de Docker com o plugin compose e do Postgres já acessível
# (ver infra/norty-car/DEPLOY.md, seção Banco).

set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$RAIZ/infra/norty-car"
ENV_FILE="$DIR/.env"
PERFIL=""
for arg in "$@"; do
  case "$arg" in
    --custom-domains) PERFIL="--profile custom-domains" ;;
    *) echo "Argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

azul()    { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
erro()    { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
trap 'erro "Falhou na linha $LINENO. Corrija e rode de novo — nada fica pela metade."' ERR

command -v docker >/dev/null || { erro "Docker não encontrado."; exit 1; }

azul "1/5 · Configuração"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  amarelo "  Criado infra/norty-car/.env a partir do exemplo."
fi
# Segredo bom é o que ninguém escolheu à mão e que não se repete em outra instalação.
gerar() {
  local chave="$1" valor
  if ! grep -qE "^${chave}=.+" "$ENV_FILE"; then
    valor="$(openssl rand -hex 32)"
    sed -i.bak "s|^${chave}=.*|${chave}=${valor}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
    verde "  ${chave} gerado."
  fi
}
gerar JWT_SECRET
gerar SECRETS_KEY
grep -qE '^POSTGRES_PASSWORD=.+' "$ENV_FILE" || { erro "Defina POSTGRES_PASSWORD em infra/norty-car/.env (o papel precisa existir no Postgres)."; exit 1; }
set -a; source "$ENV_FILE"; set +a
amarelo "  Guarde SECRETS_KEY no cofre: sem ela, os segredos de MFA e de integrações ficam ilegíveis."

COMPOSE="docker compose -f $DIR/docker-compose.yml --env-file $ENV_FILE $PERFIL"

azul "2/5 · Construindo as imagens"
$COMPOSE build --pull

azul "3/5 · Aplicando migrações"
# Migração antes de subir a versão nova: a API nunca roda contra um banco atrasado.
$COMPOSE run --rm --no-deps --entrypoint sh api -c 'npx prisma migrate deploy'

azul "4/5 · Semeando a estrutura base (planos e conta inicial do Master)"
$COMPOSE run --rm --no-deps \
  -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_NAME -e BOOTSTRAP_ADMIN_PASSWORD \
  --entrypoint sh api -c 'npx tsx prisma/seed.ts'

azul "5/5 · Subindo os serviços"
$COMPOSE up -d
printf '  Aguardando a API'
for _ in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:${API_PORT:-3071}/v1/health" >/dev/null 2>&1; then
    printf '\n'; verde "Norty Car no ar."; exit 0
  fi
  printf '.'; sleep 2
done
printf '\n'
amarelo "A API ainda não respondeu. Veja: $COMPOSE logs --tail=80 api"
