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

# Três pastas viajam, não uma: o aplicativo, a API e o domínio
# compartilhado. Elas vão para dentro do MESMO diretório porque o
# bind-mount do CT 103 é por app — criar um mount novo exigiria
# reiniciar o container, derrubando Bolão, Central de Leads e
# Sorva junto.
#
# `--delete` limpa o que saiu do repositório, mas `--exclude .env`
# é o que impede o deploy de apagar os segredos do host. Sem essa
# linha, cada deploy derrubaria a API por falta de DATABASE_URL.
rsync -a --delete \
  --exclude 'dist/' --exclude 'node_modules/' --exclude 'perfil.json' \
  --exclude '.env' --exclude 'servidor/' --exclude 'compartilhado/' \
  "$CLONE_HOST/apps/licita-mais/" "$APP_HOST/"

rsync -a --delete \
  --exclude 'dist/' --exclude 'node_modules/' --exclude 'gerado/' --exclude '.env' \
  "$CLONE_HOST/apps/licita-api/" "$APP_HOST/servidor/"

rsync -a --delete \
  --exclude 'dist/' --exclude 'node_modules/' \
  "$CLONE_HOST/packages/licitacoes-shared/" "$APP_HOST/compartilhado/"

verde "Código em $APP_HOST ($(git -C "$CLONE_HOST" rev-parse --short HEAD))"

# ---------- Segredos ----------

if [[ ! -f "$APP_HOST/.env" ]]; then
  cp "$APP_HOST/.env.example" "$APP_HOST/.env"
  chmod 600 "$APP_HOST/.env"

  vermelho "Criei $APP_HOST/.env a partir do exemplo — ele está incompleto."
  echo
  amarelo "Antes de seguir, preencha no mínimo:"
  echo "    DATABASE_URL   — rode ./preparar-banco.sh e cole o que ele imprime"
  echo "    JWT_SECRET     — openssl rand -base64 48"
  echo
  amarelo "E, para que alguém consiga confirmar a conta e entrar:"
  echo "    SMTP_HOST, SMTP_USER, SMTP_PASS  — SMTP do heimdall"
  echo
  amarelo "Edite e rode este script de novo:"
  echo "    nano $APP_HOST/.env"
  exit 2
fi

# Falhar aqui é melhor do que falhar no build: a mensagem do
# compose para variável obrigatória vazia não diz o que fazer.
for obrigatoria in DATABASE_URL JWT_SECRET; do
  if ! grep -qE "^${obrigatoria}=.+" "$APP_HOST/.env"; then
    vermelho "$obrigatoria está vazia em $APP_HOST/.env — a API não sobe sem ela."
    exit 2
  fi
done

if ! grep -qE '^SMTP_HOST=.+' "$APP_HOST/.env"; then
  amarelo "SMTP_HOST vazio: o cadastro vai funcionar, mas o link de confirmação"
  amarelo "não sai — e sem confirmar o e-mail ninguém consegue entrar."
fi

# ---------- Reconstrói dentro do CT ----------

passo "Reconstruindo dentro do CT $CT"

pct exec "$CT" -- bash -c "cd '$APP_CT' && LICITA_PORT=${PORTA} docker compose up -d --build"

# ---------- Confere que subiu ----------

passo "Conferindo"

IP_CT="$(pct exec "$CT" -- bash -c "hostname -I" 2>/dev/null | awk '{print $1}')"
IP_CT="${IP_CT:-192.168.15.73}"

# Espera em vez de conferir uma vez só. A API roda `prisma migrate
# deploy` ANTES de escutar a porta, e a primeira subida ainda cria
# doze tabelas — pedir a saúde três segundos depois do compose
# responder é perguntar cedo demais e chamar de falha o que era
# só demora.
esperar_por() {
  local rotulo="$1" caminho="$2" limite="${3:-120}" passado=0

  while (( passado < limite )); do
    if pct exec "$CT" -- wget -q -O- "http://127.0.0.1:${PORTA}${caminho}" >/dev/null 2>&1; then
      verde "$rotulo respondendo (${passado}s)"
      return 0
    fi
    sleep 5
    passado=$(( passado + 5 ))
    # Sinal de vida a cada 15s: sem ele, dois minutos de silêncio
    # parecem travamento.
    (( passado % 15 == 0 )) && amarelo "  aguardando $rotulo… ${passado}s"
  done

  return 1
}

if ! esperar_por "Aplicativo" "/" 60; then
  vermelho "O container subiu mas não respondeu na porta ${PORTA}. Logs:"
  pct exec "$CT" -- bash -c "cd '$APP_CT' && docker compose logs --tail=40 licita-web"
  exit 1
fi
verde "  http://${IP_CT}:${PORTA}"

# A API é conferida pelo mesmo caminho que o navegador usa — pelo
# nginx, sob /v1. Testá-la direto no container provaria que o
# processo subiu, não que o front consegue falar com ele.
if esperar_por "API" "/v1/saude" 180; then
  verde "  http://${IP_CT}:${PORTA}/v1/saude — banco alcançável"
else
  vermelho "A API não respondeu em /v1/saude em 3 minutos. O aplicativo fica"
  vermelho "em modo demonstração até isso ser resolvido."
  echo
  amarelo "Estado dos containers:"
  pct exec "$CT" -- bash -c "cd '$APP_CT' && docker compose ps"
  echo
  amarelo "Últimas linhas da API:"
  pct exec "$CT" -- bash -c "cd '$APP_CT' && docker compose logs --tail=80 licita-api"
  echo
  amarelo "Causas mais comuns, nesta ordem:"
  echo "    1. DATABASE_URL errada, ou o Postgres não aceita conexão deste CT"
  echo "       (em Docker: a 5432 precisa estar publicada em 0.0.0.0, não no loopback)"
  echo "    2. O banco ou o papel não existem — rode ./preparar-banco.sh"
  echo "    3. JWT_SECRET com menos de 32 caracteres: a API recusa subir"
  echo
  amarelo "Para acompanhar ao vivo:"
  echo "    pct exec ${CT} -- bash -c 'cd ${APP_CT} && docker compose logs -f licita-api'"
  exit 1
fi

# ---------- O que falta ----------

cat <<FIM

$(amarelo "Falta a primeira varredura. Sem ela o painel fica vazio até as 5h:")

  pct exec ${CT} -- bash -c \\
    'cd ${APP_CT} && docker compose exec -T licita-api node dist/tarefas/ingestao.js'

$(amarelo "Falta o ingress. No CT onde roda o cloudflared, acrescente ao")
$(amarelo "bloco 'ingress:' do config.yml — ANTES da regra final de 404:")

  - hostname: licita.norty.com.br
    service: http://${IP_CT}:${PORTA}

E registre o DNS uma única vez:

  cloudflared tunnel route dns <nome-do-tunel> licita.norty.com.br

Depois recarregue o cloudflared (systemctl reload cloudflared, ou
'docker compose restart' no serviço dele).

FIM
