#!/usr/bin/env bash
# =========================================================
#  LICITA+ — deploy no Thor
# ---------------------------------------------------------
#  Roda NO HOST thor (não dentro do CT), como root.
#
#  Segue a regra de ouro da infra Norty: o código mora no host em
#  /srv/apps-fase<N>/licita-mais e entra no CT pelo bind-mount já
#  existente em /opt/fase<N>. Este script atualiza o host e manda
#  o CT reconstruir.
#
#  Uso:
#    ./deploy-thor.sh                 # usa os padrões abaixo
#    CT=105 FASE=3 ./deploy-thor.sh   # explícito
#
#  Nada aqui toca outro app: só o diretório do LICITA+ e só o
#  compose dele.
# =========================================================

set -euo pipefail

CT="${CT:-105}"
FASE="${FASE:-3}"
BRANCH="${BRANCH:-claude/gov-bidding-automation-4jopo0}"
REPO="${REPO:-https://github.com/yurigoes/Norty-Nexor.git}"

RAIZ_HOST="/srv/apps-fase${FASE}"
APP_HOST="${RAIZ_HOST}/licita-mais"
CLONE_HOST="${RAIZ_HOST}/.licita-mais-repo"
APP_CT="/opt/fase${FASE}/licita-mais"

vermelho() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
passo()    { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# ---------- Verificações antes de mexer em qualquer coisa ----------

passo "Conferindo o ambiente"

command -v pct >/dev/null || {
  vermelho "pct não encontrado. Este script roda no host thor, não dentro do CT."
  exit 1
}

pct status "$CT" >/dev/null 2>&1 || {
  vermelho "CT $CT não existe. Confira o número na tabela da infra."
  exit 1
}

if [[ "$(pct status "$CT")" != "status: running" ]]; then
  vermelho "CT $CT não está rodando. Suba com: pct start $CT"
  exit 1
fi

# O bind-mount precisa existir: sem ele o código não chega no CT
# e o build falharia com "no such file or directory" lá dentro.
[[ -d "$RAIZ_HOST" ]] || {
  vermelho "$RAIZ_HOST não existe no host. Confira a fase (FASE=$FASE) na tabela."
  exit 1
}

pct exec "$CT" -- test -d "/opt/fase${FASE}" || {
  vermelho "O CT $CT não enxerga /opt/fase${FASE}. O bind-mount não está montado."
  exit 1
}

pct exec "$CT" -- command -v docker >/dev/null || {
  vermelho "Docker não encontrado dentro do CT $CT."
  exit 1
}

verde "CT $CT ativo, bind-mount /opt/fase${FASE} visível, Docker presente."

# ---------- Atualiza o código no host ----------

passo "Atualizando o código em $APP_HOST"

if [[ -d "$CLONE_HOST/.git" ]]; then
  git -C "$CLONE_HOST" fetch origin "$BRANCH"
  git -C "$CLONE_HOST" checkout "$BRANCH"
  git -C "$CLONE_HOST" reset --hard "origin/$BRANCH"
else
  rm -rf "$CLONE_HOST"
  git clone --branch "$BRANCH" --depth 1 "$REPO" "$CLONE_HOST"
fi

# Só o diretório do app vai para /srv. O resto do monorepo fica no
# clone auxiliar — o CT não precisa dele e copiar tudo só ocuparia
# disco.
mkdir -p "$APP_HOST"
rsync -a --delete \
  --exclude 'dist/' --exclude 'node_modules/' --exclude 'perfil.json' \
  "$CLONE_HOST/apps/licita-mais/" "$APP_HOST/"

verde "Código em $APP_HOST ($(git -C "$CLONE_HOST" rev-parse --short HEAD))"

# ---------- Reconstrói dentro do CT ----------

passo "Reconstruindo dentro do CT $CT"

pct exec "$CT" -- bash -c "cd '$APP_CT' && docker compose up -d --build"

# ---------- Confere que subiu ----------

passo "Conferindo"

PORTA="$(pct exec "$CT" -- bash -c "cd '$APP_CT' && docker compose port licita-web 80 2>/dev/null | cut -d: -f2" || true)"
PORTA="${PORTA:-3060}"

sleep 3
if pct exec "$CT" -- wget -q -O- "http://127.0.0.1:${PORTA}/" >/dev/null 2>&1; then
  verde "LICITA+ respondendo em http://$(pct exec "$CT" -- hostname -I | awk '{print $1}'):${PORTA}"
  echo
  echo "Falta apontar licita.norty.com.br para essa porta no ingress."
else
  vermelho "O container subiu mas não respondeu na porta ${PORTA}. Logs:"
  pct exec "$CT" -- bash -c "cd '$APP_CT' && docker compose logs --tail=40 licita-web"
  exit 1
fi
