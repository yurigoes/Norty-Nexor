#!/usr/bin/env bash
#
# my Home by norty — instalação e atualização em um comando.
#
#   ./scripts/bootstrap.sh              sobe (ou atualiza) a stack completa
#   ./scripts/bootstrap.sh --demo       idem, populando dados de demonstração
#   ./scripts/bootstrap.sh --sem-check  pula o diagnóstico inicial
#
# É seguro rodar de novo: as migrações e a semeadura são idempotentes,
# então este mesmo script serve tanto para o primeiro deploy quanto para
# cada atualização depois.

set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f $RAIZ/infra/docker-compose.yml --env-file $RAIZ/infra/.env"
DEMO=false
CHECAR=true
for arg in "$@"; do
  case "$arg" in
    --demo)      DEMO=true ;;
    --sem-check) CHECAR=false ;;
  esac
done

azul()    { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
erro()    { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

trap 'erro "Falhou na linha $LINENO. Nada foi deixado pela metade: rode de novo depois de corrigir."' ERR

# ---------- 1. Pré-requisitos ----------
azul "1/6 · Conferindo pré-requisitos"

# O diagnóstico completo roda antes de qualquer coisa: é melhor receber a
# lista inteira de pendências agora do que descobrir na etapa 5, com meia
# stack no ar.
if $CHECAR && [[ -x "$RAIZ/scripts/preflight.sh" ]]; then
  if ! "$RAIZ/scripts/preflight.sh"; then
    erro "O diagnóstico encontrou problemas. Corrija-os, ou rode com --sem-check para seguir mesmo assim."
    exit 1
  fi
fi

for programa in docker openssl; do
  command -v "$programa" >/dev/null 2>&1 || {
    erro "'$programa' não encontrado. Instale antes de continuar."
    exit 1
  }
done

docker compose version >/dev/null 2>&1 || {
  erro "Docker Compose v2 não encontrado (o comando é 'docker compose', com espaço)."
  exit 1
}

docker info >/dev/null 2>&1 || {
  erro "O Docker não está rodando, ou seu usuário não tem permissão."
  erro "Se for permissão:  sudo usermod -aG docker \$USER  e reabra a sessão."
  exit 1
}

# ---------- 2. Configuração ----------
azul "2/6 · Preparando a configuração"

ENV_FILE="$RAIZ/infra/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$RAIZ/infra/.env.example" "$ENV_FILE"
  amarelo "  Criado infra/.env a partir do exemplo."
fi

# Gera os segredos que ainda estiverem vazios. Segredo bom é segredo que
# ninguém escolheu à mão — e que não é o mesmo de outra instalação.
gerar_segredo() {
  local chave="$1" tamanho="$2"
  if ! grep -qE "^${chave}=.+" "$ENV_FILE"; then
    local valor
    valor="$(openssl rand -base64 "$tamanho" | tr -d '\n/+=' | cut -c1-"$tamanho")"
    # A barra é o separador do sed; base64 pode conter uma.
    sed -i.bak "s|^${chave}=.*|${chave}=${valor}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
    verde "  $chave gerado."
  fi
}
gerar_segredo POSTGRES_PASSWORD 32
gerar_segredo JWT_SECRET 48

if ! grep -qE '^ACME_EMAIL=.+@.+' "$ENV_FILE"; then
  erro "Preencha ACME_EMAIL em infra/.env — o Let's Encrypt precisa dele para emitir o certificado."
  exit 1
fi

set -a; source "$ENV_FILE"; set +a
verde "  Domínios: ${APP_DOMAIN} e ${API_DOMAIN}"

# ---------- 3. Imagens ----------
azul "3/6 · Construindo as imagens (pode demorar alguns minutos na primeira vez)"
$COMPOSE build --pull

# ---------- 4. Banco ----------
azul "4/6 · Subindo o banco"
$COMPOSE up -d db redis

printf '  Aguardando o PostgreSQL aceitar conexões'
for _ in $(seq 1 60); do
  if $COMPOSE exec -T db pg_isready -U "${POSTGRES_USER:-myhome}" >/dev/null 2>&1; then
    printf '\n'; verde '  Banco pronto.'; break
  fi
  printf '.'; sleep 2
done

# ---------- 5. Migrações e semeadura ----------
azul "5/6 · Aplicando migrações"
$COMPOSE run --rm --entrypoint sh api -c 'npx prisma migrate deploy'

azul "      Semeando dados iniciais"
if $DEMO; then
  $COMPOSE run --rm --entrypoint sh -e SEED_DEMO=true api -c 'npx tsx prisma/seed.ts'
else
  $COMPOSE run --rm --entrypoint sh api -c 'npx tsx prisma/seed.ts'
fi

# ---------- 6. Aplicação ----------
azul "6/6 · Subindo a aplicação"
$COMPOSE up -d

printf '  Aguardando a API responder'
API_OK=false
for _ in $(seq 1 45); do
  if $COMPOSE exec -T api node -e "fetch('http://127.0.0.1:3333/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    API_OK=true; printf '\n'; break
  fi
  printf '.'; sleep 2
done

echo
if $API_OK; then
  verde "my Home no ar."
else
  amarelo "A API ainda não respondeu. Veja os logs com: npm run logs"
fi

cat <<FIM

  Aplicativo   https://${APP_DOMAIN}
  API          https://${API_DOMAIN}/v1/health

  Para os endereços resolverem, os dois subdomínios precisam apontar
  para o IP público deste servidor, e as portas 80 e 443 precisam
  chegar até aqui. O certificado é emitido no primeiro acesso.

  Logs:     npm run logs
  Parar:    npm run down
FIM
