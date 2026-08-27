#!/usr/bin/env bash
# =========================================================
#  LICITA+ — cria o banco no Postgres da Norty
# ---------------------------------------------------------
#  Roda NO HOST thor, como root. Cria o papel e a base que a API
#  usa, no CT do Postgres (102 por padrão), e grava DATABASE_URL e
#  JWT_SECRET direto no .env da aplicação.
#
#  Grava em vez de imprimir por dois motivos: o .env só nasceria no
#  fim do deploy, então mandar editá-lo antes é mandar editar um
#  arquivo que não existe; e a senha recém-gerada não precisa passar
#  pelo terminal — é um lugar a menos onde ela fica.
#
#  É idempotente: rodar duas vezes não quebra nada e não troca a
#  senha de um papel que já existe — trocar a senha por descuido
#  derrubaria a API que já estivesse usando a antiga.
#
#  Uso:
#    ./preparar-banco.sh                 # CT 102, banco e papel "licita"
#    CT_PG=102 BANCO=licita ./preparar-banco.sh
# =========================================================

set -euo pipefail

CT_PG="${CT_PG:-102}"
BANCO="${BANCO:-licita}"
PAPEL="${PAPEL:-licita}"

vermelho() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
passo()    { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# ---------- Antes de mexer em qualquer coisa ----------

command -v pct >/dev/null || {
  vermelho "pct não encontrado. Este script roda no host thor, não dentro de um CT."
  exit 1
}

pct status "$CT_PG" >/dev/null 2>&1 || {
  vermelho "CT $CT_PG não existe. Confira o número do Postgres na tabela da infra."
  exit 1
}

[[ "$(pct status "$CT_PG")" == "status: running" ]] || {
  vermelho "CT $CT_PG não está rodando. Suba com: pct start $CT_PG"
  exit 1
}

# ---------- Onde o Postgres realmente está ----------
#
# Duas montagens convivem na infra Norty: Postgres instalado no
# próprio LXC, e Postgres em Docker dentro do LXC. No segundo caso
# o `psql` existe, mas dentro do container — não no PATH do CT. Em
# vez de exigir que você saiba qual é qual, o script descobre.
#
# `pct exec` faz execvp direto, sem shell: tudo que dependa de
# PATH, pipe ou builtin precisa vir dentro de `bash -c`.

no_ct() { pct exec "$CT_PG" -- bash -c "$1"; }

MODO=""

if [[ -n "${CONTAINER_PG:-}" ]]; then
  MODO="docker"
  amarelo "Usando o container Docker \"$CONTAINER_PG\" (CONTAINER_PG)."
elif no_ct 'command -v psql' >/dev/null 2>&1; then
  MODO="nativo"
  verde "Postgres nativo no CT $CT_PG."
elif no_ct 'command -v docker' >/dev/null 2>&1; then
  # Procura pelo processo que de fato serve Postgres, e não pelo
  # nome do container: nome é convenção, imagem é fato.
  CONTAINER_PG="$(no_ct \
    'docker ps --filter ancestor=postgres --format "{{.Names}}" 2>/dev/null | head -1' \
    2>/dev/null || true)"

  if [[ -z "$CONTAINER_PG" ]]; then
    CONTAINER_PG="$(no_ct \
      'docker ps --format "{{.Names}} {{.Image}}" 2>/dev/null | grep -i postgres | head -1 | cut -d" " -f1' \
      2>/dev/null || true)"
  fi

  if [[ -n "$CONTAINER_PG" ]]; then
    MODO="docker"
    verde "Postgres em Docker no CT $CT_PG, container \"$CONTAINER_PG\"."
  fi
fi

if [[ -z "$MODO" ]]; then
  vermelho "Não achei Postgres no CT $CT_PG — nem nativo, nem em Docker."
  echo
  amarelo "O que este CT tem:"
  no_ct 'command -v psql || echo "  psql: não"; command -v docker || echo "  docker: não"' 2>/dev/null || true
  echo
  amarelo "Containers rodando nele, se houver Docker:"
  no_ct 'docker ps --format "  {{.Names}}  {{.Image}}  {{.Ports}}" 2>/dev/null || echo "  (sem docker)"' 2>/dev/null || true
  echo
  amarelo "Para descobrir quem escuta a 5432 no cluster, sem chutar CT:"
  echo "    for c in \$(pct list | awk 'NR>1 {print \$1}'); do"
  echo "      echo -n \"CT \$c: \"; pct exec \$c -- bash -c 'ss -ltn 2>/dev/null | grep -c :5432' 2>/dev/null || echo 0"
  echo "    done"
  echo
  amarelo "Achado o certo, rode de novo apontando para ele:"
  echo "    CT_PG=<numero> $0"
  echo "    CT_PG=<numero> CONTAINER_PG=<nome-do-container> $0"
  exit 1
fi

passo "Preparando o banco"

# Uma função só para os dois modos: quem chama não precisa saber
# onde o Postgres mora.
pg() {
  local sql="$1" alvo="${2:-postgres}"
  if [[ "$MODO" == "docker" ]]; then
    no_ct "docker exec -i '$CONTAINER_PG' psql -U postgres -d '$alvo' -tAc \"$sql\""
  else
    no_ct "su postgres -c \"psql -d '$alvo' -tAc \\\"$sql\\\"\""
  fi
}

# ---------- Papel ----------

if [[ "$(pg "SELECT 1 FROM pg_roles WHERE rolname='${PAPEL}'")" == "1" ]]; then
  amarelo "Papel \"$PAPEL\" já existe — mantendo a senha atual."
  SENHA=""
else
  SENHA="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)"
  pg "CREATE ROLE ${PAPEL} WITH LOGIN PASSWORD '${SENHA}'" >/dev/null
  verde "Papel \"$PAPEL\" criado."
fi

# ---------- Banco ----------

if [[ "$(pg "SELECT 1 FROM pg_database WHERE datname='${BANCO}'")" == "1" ]]; then
  amarelo "Banco \"$BANCO\" já existe."
else
  pg "CREATE DATABASE ${BANCO} OWNER ${PAPEL}" >/dev/null
  verde "Banco \"$BANCO\" criado."
fi

# O dono do banco já pode tudo nele, mas no Postgres 15+ o schema
# public deixou de ser gravável por qualquer um — sem esta linha a
# migração falharia em "permission denied for schema public", já com
# o container de pé.
pg "GRANT ALL ON SCHEMA public TO ${PAPEL}" "$BANCO" >/dev/null
verde "Permissões do schema public concedidas a \"$PAPEL\"."

# ---------- Endereço ----------

IP_PG="$(pct exec "$CT_PG" -- bash -c 'hostname -I' 2>/dev/null | awk '{print $1}')"
IP_PG="${IP_PG:-192.168.15.72}"

# O Postgres precisa aceitar conexão vinda do CT da aplicação, não
# só do próprio host. A armadilha muda de forma conforme a
# montagem, então a checagem também muda — e nenhuma delas
# interrompe o script: são avisos, não veredictos.
if [[ "$MODO" == "docker" ]]; then
  PORTAS="$(no_ct "docker port '$CONTAINER_PG' 5432" 2>/dev/null || true)"

  if [[ -z "$PORTAS" ]]; then
    amarelo "Atenção: o container \"$CONTAINER_PG\" não publica a 5432 no CT."
    amarelo "Sem publicação, o CT 103 não alcança este Postgres."
  elif grep -q '127.0.0.1' <<<"$PORTAS"; then
    amarelo "Atenção: a 5432 está publicada só no loopback do CT ($PORTAS)."
    amarelo "Nesse caso o CT 103 não conecta — a publicação precisa ser 0.0.0.0."
  fi
else
  if ! no_ct "grep -qE \"^\\s*listen_addresses\\s*=\\s*'\\*'\" /etc/postgresql/*/main/postgresql.conf" 2>/dev/null; then
    amarelo "Atenção: listen_addresses pode não estar aberto para a rede."
    amarelo "Se a API não conectar, confira dentro do CT $CT_PG:"
    echo "    /etc/postgresql/*/main/postgresql.conf → listen_addresses = '*'"
    echo "    /etc/postgresql/*/main/pg_hba.conf     → host $BANCO $PAPEL 192.168.15.0/24 scram-sha-256"
  fi
fi

# ---------- Escreve o .env ----------
#
# O script grava o arquivo em vez de imprimir a senha para você
# colar. Dois motivos: o .env só nasceria no fim do deploy, então
# mandar editá-lo antes é mandar editar um arquivo que não existe;
# e a senha recém-gerada nunca precisa aparecer no terminal — do
# gerador direto para o arquivo é um lugar a menos onde ela fica.

ENV_APP="${ENV_APP:-/srv/apps-fase${FASE:-1}/licita-mais/.env}"
# Absoluto: o caminho é impresso no fim para ser colado, e
# relativo ele só funcionaria de dentro desta pasta.
AQUI="$(cd "$(dirname "$0")" && pwd)"
EXEMPLO="$AQUI/.env.example"

# `awk -v` carrega o valor sem interpretar nada: senha em base64
# tem `+` e `/`, que quebrariam um `sed` com barra de delimitador.
definir_env() {
  local chave="$1" valor="$2" arquivo="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$chave" -v v="$valor" '
    $0 ~ "^" k "=" { print k "=" v; achou = 1; next }
    { print }
    END { if (!achou) print k "=" v }
  ' "$arquivo" > "$tmp"
  mv "$tmp" "$arquivo"
  chmod 600 "$arquivo"
}

valor_env() {
  grep -E "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- || true
}

passo "Escrevendo $ENV_APP"

mkdir -p "$(dirname "$ENV_APP")"

if [[ ! -f "$ENV_APP" ]]; then
  if [[ -f "$EXEMPLO" ]]; then
    cp "$EXEMPLO" "$ENV_APP"
    verde "Criado a partir de .env.example."
  else
    : > "$ENV_APP"
    amarelo "Sem .env.example ao lado do script — criei um .env vazio."
  fi
  chmod 600 "$ENV_APP"
else
  amarelo "Já existia — só os campos vazios serão preenchidos."
fi

URL_NOVA="postgresql://${PAPEL}:${SENHA}@${IP_PG}:5432/${BANCO}?schema=public"
URL_ATUAL="$(valor_env DATABASE_URL "$ENV_APP")"

if [[ -n "$SENHA" ]]; then
  definir_env DATABASE_URL "$URL_NOVA" "$ENV_APP"
  verde "DATABASE_URL gravada (senha nova, não impressa aqui de propósito)."
elif [[ -n "$URL_ATUAL" && "$URL_ATUAL" != *TROQUE* ]]; then
  amarelo "DATABASE_URL preservada — o papel já existia e a senha atual é a que vale."
else
  # O papel existe, mas ninguém sabe a senha: adivinhar seria pior
  # do que dizer.
  vermelho "O papel \"$PAPEL\" já existe e o .env não tem a senha dele."
  amarelo "Defina uma nova (isto derruba quem estiver usando a antiga) e grave à mão."
fi

# JWT_SECRET assina o access token. Gerado aqui para ninguém
# inventar um curto — em produção a API recusa subir com menos de
# 32 caracteres, e descobrir isso no deploy custa uma ida e volta.
if [[ -z "$(valor_env JWT_SECRET "$ENV_APP")" ]]; then
  definir_env JWT_SECRET "$(openssl rand -base64 48 | tr -d '\n')" "$ENV_APP"
  verde "JWT_SECRET gerado."
else
  amarelo "JWT_SECRET preservado — trocá-lo derrubaria as sessões abertas."
fi

passo "Pronto"

if [[ -n "$SENHA" ]]; then
  cat <<FIM
Banco criado e $ENV_APP preenchido. Falta só o SMTP:

  SMTP_USER=  e  SMTP_PASS=

Sem eles o cadastro funciona, mas o link de confirmação não sai —
e sem confirmar o e-mail ninguém entra.
FIM
else
  cat <<FIM
Banco conferido e $ENV_APP atualizado no que estava vazio.

O papel já existia, então a senha não foi trocada — trocá-la
derrubaria a API que estivesse usando a antiga. Se ela se perdeu:

$(if [[ "$MODO" == "docker" ]]; then
    echo "  pct exec ${CT_PG} -- bash -c \"docker exec -i ${CONTAINER_PG} psql -U postgres -tAc \\\"ALTER ROLE ${PAPEL} WITH PASSWORD 'nova'\\\"\""
  else
    echo "  pct exec ${CT_PG} -- bash -c \"su postgres -c 'psql -tAc \\\"ALTER ROLE ${PAPEL} WITH PASSWORD '\\''nova'\\''\\\"'\""
  fi)

...e grave a nova DATABASE_URL em $ENV_APP.
FIM
fi

cat <<FIM

Depois disso, ainda no host thor:

  1. Complete o SMTP         nano $ENV_APP
     (só SMTP_USER e SMTP_PASS — o resto já está preenchido)

  2. Suba a aplicação        $AQUI/deploy-thor.sh
     (a migração roda sozinha na subida do container)

     Rode a partir do clone, e não de /srv: /srv só recebe os
     arquivos no fim do deploy, então de lá roda a versão anterior.

  3. Primeira varredura      pct exec 103 -- bash -c \\
       'cd /opt/licita-mais && docker compose exec -T licita-api \\
        node dist/tarefas/ingestao.js'

Sem o passo 3 o painel fica vazio até a rotina das 5h.
FIM
