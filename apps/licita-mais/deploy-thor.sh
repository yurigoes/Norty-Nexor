#!/usr/bin/env bash
# =========================================================
#  LICITA+ — deploy no Thor
# ---------------------------------------------------------
#  Roda NO HOST thor (não dentro do CT), como root.
#
#  Regra de ouro da infra Norty: o código mora no host em
#  /srv/apps-fase<N>/<app> e entra no CT por bind-mount. Edita-se
#  no host, reconstrói-se dentro do container.
#
#  Atenção ao CT 103: ali o bind-mount é POR APP
#  (/srv/apps-fase1/bolao → /opt/bolao), diferente do 104 e do 105,
#  que montam a pasta da fase inteira. Um app novo no 103 precisa de
#  um mount point novo — e mount point em LXC só aparece depois de
#  reiniciar o container.
#
#  Este script NUNCA reinicia o CT. Se o mount faltar, ele imprime
#  o comando e para: reiniciar o 103 derrubaria Bolão, Central de
#  Leads e Sorva junto, e essa decisão é sua.
#
#  Uso:
#    ./deploy-thor.sh                      # CT 103, porta 3500
#    CT=105 MOUNT=/opt/fase3/licita-mais ./deploy-thor.sh
# =========================================================

set -euo pipefail

CT="${CT:-103}"
FASE="${FASE:-1}"
PORTA="${LICITA_PORT:-3500}"
BRANCH="${BRANCH:-claude/gov-bidding-automation-4jopo0}"
REPO="${REPO:-https://github.com/yurigoes/Norty-Nexor.git}"

RAIZ_HOST="/srv/apps-fase${FASE}"
APP_HOST="${RAIZ_HOST}/licita-mais"
CLONE_HOST="${RAIZ_HOST}/.licita-mais-repo"

# O 103 monta app por app; 104 e 105 montam a fase inteira.
if [[ -n "${MOUNT:-}" ]]; then
  APP_CT="$MOUNT"
elif [[ "$CT" == "103" ]]; then
  APP_CT="/opt/licita-mais"
else
  APP_CT="/opt/fase${FASE}/licita-mais"
fi

vermelho() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
passo()    { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# ---------- Verificações antes de mexer em qualquer coisa ----------

passo "Conferindo o ambiente (CT $CT, fase $FASE, porta $PORTA)"

command -v pct >/dev/null || {
  vermelho "pct não encontrado. Este script roda no host thor, não dentro do CT."
  exit 1
}

pct status "$CT" >/dev/null 2>&1 || {
  vermelho "CT $CT não existe. Confira o número na tabela da infra."
  exit 1
}

[[ "$(pct status "$CT")" == "status: running" ]] || {
  vermelho "CT $CT não está rodando. Suba com: pct start $CT"
  exit 1
}

if ! pct exec "$CT" -- bash -c 'command -v docker' >/dev/null 2>&1; then
  vermelho "Docker não encontrado dentro do CT $CT."
  echo
  amarelo "O que o CT tem hoje:"
  pct exec "$CT" -- bash -c 'ls -1 /usr/bin | grep -i -E "^docker|^podman|^containerd" || echo "  (nada parecido com docker)"' 2>/dev/null || true
  echo
  amarelo "Se os outros apps do CT rodam em Docker, ele deve estar em outro caminho:"
  echo "    pct exec $CT -- bash -lc 'which docker; docker --version'"
  echo
  amarelo "Se realmente não houver Docker, instale dentro do CT:"
  echo "    pct exec $CT -- bash -c 'curl -fsSL https://get.docker.com | sh'"
  exit 1
fi

# O compose v2 é plugin do Docker; v1 é um binário separado com
# outra sintaxe. Sem essa distinção o build falharia lá na frente
# com "unknown command", já depois de mexer no código.
if ! pct exec "$CT" -- bash -c 'docker compose version' >/dev/null 2>&1; then
  vermelho "Docker existe no CT $CT, mas o plugin 'docker compose' (v2) não responde."
  pct exec "$CT" -- bash -c 'docker compose version' 2>&1 | head -5 || true
  echo
  amarelo "Instale o plugin dentro do CT:"
  echo "    pct exec $CT -- bash -c 'apt-get update && apt-get install -y docker-compose-plugin'"
  exit 1
fi

mkdir -p "$APP_HOST"

# O mount precisa existir ANTES do build: sem ele o código não chega
# no CT e o compose falharia lá dentro com "no such file".
if ! pct exec "$CT" -- bash -c "test -d '$APP_CT'" 2>/dev/null; then
  vermelho "O CT $CT não enxerga $APP_CT — falta o bind-mount."
  echo
  amarelo "Para criar (escolha um mpN livre; veja os usados com: pct config $CT):"
  echo
  echo "    pct set $CT -mp9 ${APP_HOST},mp=${APP_CT}"
  echo "    pct reboot $CT"
  echo
  vermelho "ATENÇÃO: reiniciar o CT $CT derruba junto os outros apps dele."
  if [[ "$CT" == "103" ]]; then
    vermelho "No 103 isso significa Bolão da Galera, Central de Leads e Sorva."
  fi
  amarelo "Faça isso numa janela combinada. Depois rode este script de novo."
  exit 2
fi

verde "CT $CT ativo, $APP_CT visível, Docker presente."

# ---------- Porta livre? ----------

PORTAS_EM_USO="$(pct exec "$CT" -- bash -c \
  'command -v ss >/dev/null && ss -ltn || (command -v netstat >/dev/null && netstat -ltn) || echo SEM_FERRAMENTA' \
  2>/dev/null || echo SEM_FERRAMENTA)"

if [[ "$PORTAS_EM_USO" == *SEM_FERRAMENTA* ]]; then
  amarelo "Nem ss nem netstat no CT $CT — não deu para conferir a porta $PORTA."
  amarelo "Se ela estiver ocupada, o compose vai reclamar no passo do build."
elif grep -q ":${PORTA} " <<<"$PORTAS_EM_USO"; then
  # Se já é o nosso container, é só um redeploy.
  if pct exec "$CT" -- bash -c "docker ps --format '{{.Names}} {{.Ports}}'" 2>/dev/null \
       | grep -q "^licita-web .*:${PORTA}->"; then
    amarelo "Porta $PORTA já é do licita-web — redeploy."
  else
    vermelho "Porta $PORTA já está ocupada no CT $CT por outro serviço:"
    grep ":${PORTA} " <<<"$PORTAS_EM_USO" || true
    amarelo "Rode de novo com outra: LICITA_PORT=3501 $0"
    exit 1
  fi
fi

# ---------- Atualiza o código no host ----------

passo "Atualizando o código em $APP_HOST"

if [[ -d "$CLONE_HOST/.git" ]]; then
  git -C "$CLONE_HOST" fetch origin "$BRANCH"
  git -C "$CLONE_HOST" checkout -B "$BRANCH" "origin/$BRANCH"
  git -C "$CLONE_HOST" reset --hard "origin/$BRANCH"
else
  rm -rf "$CLONE_HOST"
  git clone --branch "$BRANCH" --depth 1 "$REPO" "$CLONE_HOST"
fi

# Só o diretório do app vai para /srv. O resto do monorepo fica no
# clone auxiliar — o CT não precisa dele.
rsync -a --delete \
  --exclude 'dist/' --exclude 'node_modules/' --exclude 'perfil.json' \
  "$CLONE_HOST/apps/licita-mais/" "$APP_HOST/"

verde "Código em $APP_HOST ($(git -C "$CLONE_HOST" rev-parse --short HEAD))"

# ---------- Reconstrói dentro do CT ----------

passo "Reconstruindo dentro do CT $CT"

pct exec "$CT" -- bash -c "cd '$APP_CT' && LICITA_PORT=${PORTA} docker compose up -d --build"

# ---------- Confere que subiu ----------

passo "Conferindo"

IP_CT="$(pct exec "$CT" -- bash -c "hostname -I" 2>/dev/null | awk '{print $1}')"
IP_CT="${IP_CT:-192.168.15.73}"
sleep 3

if pct exec "$CT" -- wget -q -O- "http://127.0.0.1:${PORTA}/" >/dev/null 2>&1; then
  verde "LICITA+ respondendo em http://${IP_CT}:${PORTA}"
else
  vermelho "O container subiu mas não respondeu na porta ${PORTA}. Logs:"
  pct exec "$CT" -- bash -c "cd '$APP_CT' && docker compose logs --tail=40 licita-web"
  exit 1
fi

# ---------- O que falta ----------

cat <<FIM

$(amarelo "Falta o ingress. No CT onde roda o cloudflared, acrescente ao")
$(amarelo "bloco 'ingress:' do config.yml — ANTES da regra final de 404:")

  - hostname: licita.norty.com.br
    service: http://${IP_CT}:${PORTA}

E registre o DNS uma única vez:

  cloudflared tunnel route dns <nome-do-tunel> licita.norty.com.br

Depois recarregue o cloudflared (systemctl reload cloudflared, ou
'docker compose restart' no serviço dele).

FIM
