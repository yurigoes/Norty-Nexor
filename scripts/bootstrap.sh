#!/usr/bin/env bash
#
# my Home by norty — instala e atualiza a stack no CT 105 Asgard.
#
#   ./scripts/bootstrap.sh              sobe (ou atualiza) a stack
#   ./scripts/bootstrap.sh --demo       idem, populando dados fictícios
#   ./scripts/bootstrap.sh --sem-check  pula o diagnóstico inicial
#
# Roda dos dois lugares e se ajusta sozinho:
#
#   · no host thor  → executa dentro do CT 105 via `pct exec`
#   · dentro do CT  → executa direto
#
# É seguro repetir: migrações e semeadura são idempotentes, então este
# mesmo script serve para o primeiro deploy e para cada atualização.

set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CT="${MYHOME_CT:-105}"
CAMINHO_CT="${MYHOME_PATH:-/opt/fase3/my-home}"

DEMO=false
CHECAR=true
for arg in "$@"; do
  case "$arg" in
    --demo)      DEMO=true ;;
    --sem-check) CHECAR=false ;;
    *) echo "Argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

azul()    { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
erro()    { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

trap 'erro "Falhou na linha $LINENO. Corrija e rode de novo — nada fica pela metade."' ERR

# ---------- Onde estamos ----------
# `pct` só existe no host Proxmox. É o jeito mais direto de saber de que
# lado da fronteira o script está rodando.
if command -v pct >/dev/null 2>&1; then
  NO_HOST=true
  executar() { pct exec "$CT" -- bash -lc "cd $CAMINHO_CT && $1"; }
  azul "Host Proxmox detectado — operando no CT $CT ($CAMINHO_CT)"
else
  NO_HOST=false
  executar() { bash -lc "cd $RAIZ && $1"; }
  azul "Executando dentro do container"
fi

COMPOSE="docker compose -f infra/docker-compose.yml --env-file infra/.env"

# ---------- 1. Diagnóstico ----------
azul "1/5 · Conferindo o ambiente"

if $CHECAR && [[ -x "$RAIZ/scripts/preflight.sh" ]]; then
  if ! "$RAIZ/scripts/preflight.sh"; then
    erro "O diagnóstico encontrou problemas. Corrija, ou use --sem-check para seguir mesmo assim."
    exit 1
  fi
fi

if $NO_HOST; then
  pct status "$CT" | grep -q running || {
    erro "O CT $CT não está rodando. Suba com: pct start $CT"
    exit 1
  }
fi

# ---------- 2. Configuração ----------
azul "2/5 · Preparando a configuração"

ENV_FILE="$RAIZ/infra/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$RAIZ/infra/.env.example" "$ENV_FILE"
  amarelo "  Criado infra/.env a partir do exemplo."
fi

# Gera os segredos que ainda estiverem vazios. Segredo bom é o que
# ninguém escolheu à mão — e que não se repete em outra instalação.
gerar_segredo() {
  local chave="$1" tamanho="$2"
  if ! grep -qE "^${chave}=.+" "$ENV_FILE"; then
    local valor
    valor="$(openssl rand -base64 "$((tamanho * 2))" | tr -dc 'A-Za-z0-9' | cut -c1-"$tamanho")"
    sed -i.bak "s|^${chave}=.*|${chave}=${valor}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
    verde "  $chave gerado."
  fi
}
gerar_segredo POSTGRES_PASSWORD 32
gerar_segredo JWT_SECRET 48

set -a; source "$ENV_FILE"; set +a
verde "  Banco: ${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
verde "  Portas internas: web ${WEB_PORT} · api ${API_PORT}"

# ---------- 3. Banco na infra compartilhada ----------
azul "3/5 · Garantindo o banco no CT 102 Yggdrasil"

# O papel e o banco são criados uma vez, na infra compartilhada. O
# `IF NOT EXISTS` do papel não existe em Postgres, daí o DO $$.
SQL=$(cat <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${POSTGRES_USER}') THEN
    CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  ELSE
    ALTER ROLE ${POSTGRES_USER} WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  END IF;
END
\$\$;
SQL
)

if $NO_HOST && pct status 102 >/dev/null 2>&1; then
  pct exec 102 -- bash -lc "su - postgres -c \"psql -v ON_ERROR_STOP=1 -c \\\"${SQL//\"/\\\\\"}\\\"\"" >/dev/null 2>&1 \
    && verde "  Papel ${POSTGRES_USER} pronto." \
    || amarelo "  Não consegui criar o papel automaticamente — veja infra/NORTY.md, seção Banco."
  pct exec 102 -- bash -lc "su - postgres -c 'psql -tAc \"SELECT 1 FROM pg_database WHERE datname='\''${POSTGRES_DB}'\''\"' | grep -q 1 || su - postgres -c 'createdb -O ${POSTGRES_USER} ${POSTGRES_DB}'" >/dev/null 2>&1 \
    && verde "  Banco ${POSTGRES_DB} pronto." \
    || amarelo "  Não consegui criar o banco automaticamente — veja infra/NORTY.md, seção Banco."
else
  amarelo "  Fora do host: crie o papel e o banco manualmente (infra/NORTY.md)."
fi

# ---------- 4. Imagens e serviços ----------
azul "4/5 · Construindo e subindo (pode demorar na primeira vez)"
executar "$COMPOSE build --pull"
executar "$COMPOSE up -d"

# ---------- 5. Migrações e semeadura ----------
azul "5/5 · Aplicando migrações"
executar "$COMPOSE exec -T api npx prisma migrate deploy"

azul "      Semeando dados iniciais"
if $DEMO; then
  executar "$COMPOSE exec -T -e SEED_DEMO=true api npx tsx prisma/seed.ts"
else
  executar "$COMPOSE exec -T api npx tsx prisma/seed.ts"
fi

printf '  Aguardando a API responder'
API_OK=false
for _ in $(seq 1 45); do
  if executar "$COMPOSE exec -T api node -e \"fetch('http://127.0.0.1:3333/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" >/dev/null 2>&1; then
    API_OK=true; printf '\n'; break
  fi
  printf '.'; sleep 2
done

echo
if $API_OK; then
  verde "my Home no ar."
else
  amarelo "A API ainda não respondeu. Veja: pct exec $CT -- bash -lc 'cd $CAMINHO_CT && $COMPOSE logs --tail=80 api'"
fi

cat <<FIM

  Interno    http://192.168.15.75:${WEB_PORT}  (web)
             http://192.168.15.75:${API_PORT}/v1/health  (api)

  Público    https://myhome.norty.com.br
             https://api-myhome.norty.com.br

  Se os endereços públicos ainda não abrirem, faltam as rotas no
  Cloudflare Tunnel. Os destinos estão em infra/NORTY.md.

FIM
