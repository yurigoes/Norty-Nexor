#!/usr/bin/env bash
#
# my Home by norty — diagnóstico antes do deploy.
#
#   ./scripts/preflight.sh
#
# Só lê e reporta: não instala, não sobe nada, não altera arquivo nenhum.
# Serve para descobrir o que falta *antes* de rodar o bootstrap, em vez de
# no meio dele — um deploy que falha na etapa 4 deixa contêiner subindo
# pela metade e é mais chato de diagnosticar que uma lista de pendências.
#
# Reconhece de onde está rodando: no host thor, no CT 105, ou fora dos dois.

set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CT="${MYHOME_CT:-105}"
CT_IP="${MYHOME_CT_IP:-192.168.15.75}"
INFRA_IP="${MYHOME_INFRA_IP:-192.168.15.72}"

OK=0; AVISOS=0; ERROS=0
verde()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; OK=$((OK+1)); }
amarelo() { printf '  \033[1;33m!\033[0m %s\n' "$*"; AVISOS=$((AVISOS+1)); }
vermelho(){ printf '  \033[1;31m✗\033[0m %s\n' "$*"; ERROS=$((ERROS+1)); }
info()    { printf '    \033[2m%s\033[0m\n' "$*"; }
secao()   { printf '\n\033[1;34m%s\033[0m\n' "$*"; }

if command -v pct >/dev/null 2>&1; then LOCAL="host"; else LOCAL="container"; fi

# Executa um comando onde a stack de fato roda.
no_ct() {
  if [[ "$LOCAL" == "host" ]]; then pct exec "$CT" -- bash -lc "$1" 2>/dev/null
  else bash -lc "$1" 2>/dev/null; fi
}

# ---------------------------------------------------------
secao "Onde estou"

if [[ "$LOCAL" == "host" ]]; then
  verde "Host Proxmox — vou inspecionar o CT $CT"
  if pct status "$CT" 2>/dev/null | grep -q running; then
    verde "CT $CT está rodando"
    HOSTNAME_CT=$(pct exec "$CT" -- hostname 2>/dev/null)
    info "hostname: ${HOSTNAME_CT:-?}"
  else
    vermelho "CT $CT não está rodando"
    info "Suba com: pct start $CT"
  fi
else
  verde "Dentro do container: $(hostname)"
fi

# ---------------------------------------------------------
secao "Código e bind-mount"

if [[ "$LOCAL" != "host" ]]; then
  if [[ -d /opt/fase3 ]]; then
    verde "Rodando sobre o bind-mount /opt/fase3"
  else
    amarelo "Não estou sob /opt/fase3 — confira se é o CT certo"
  fi
elif true; then
  if [[ -d /srv/apps-fase3 ]]; then
    verde "/srv/apps-fase3 existe no host"
  else
    vermelho "/srv/apps-fase3 não existe — é onde o código deve morar"
  fi
  if no_ct "test -d /opt/fase3"; then
    verde "Bind-mount /srv/apps-fase3 → /opt/fase3 ativo no CT $CT"
  else
    vermelho "/opt/fase3 não aparece dentro do CT $CT"
    info "Confira o mountpoint: pct config $CT | grep mp"
  fi
fi

# ---------------------------------------------------------
secao "Docker no CT $CT"

if no_ct "command -v docker >/dev/null"; then
  verde "Docker instalado: $(no_ct 'docker --version' | cut -d, -f1)"
else
  vermelho "Docker não encontrado dentro do CT $CT"
fi

if no_ct "docker compose version >/dev/null"; then
  verde "Docker Compose v2: $(no_ct 'docker compose version --short')"
else
  vermelho "Docker Compose v2 ausente no CT $CT"
fi

if no_ct "docker info >/dev/null"; then
  verde "Daemon do Docker respondendo"
else
  vermelho "Daemon do Docker não responde dentro do CT $CT"
  info "Em LXC não privilegiado o Docker exige nesting=1 e keyctl=1."
fi

DISCO_GB=$(no_ct "df -BG --output=avail / | tail -1 | tr -dc '0-9'")
DISCO_GB=${DISCO_GB:-0}
if   (( DISCO_GB >= 12 )); then verde "Disco livre no CT: ${DISCO_GB} GB"
elif (( DISCO_GB >= 6 ));  then amarelo "Disco livre no CT: ${DISCO_GB} GB — as imagens ocupam ~4 GB"
else vermelho "Disco livre no CT: ${DISCO_GB} GB — insuficiente"; fi

# ---------------------------------------------------------
secao "Infra compartilhada — CT 102 Yggdrasil ($INFRA_IP)"

testar_porta() {
  local host="$1" porta="$2" nome="$3"
  if no_ct "timeout 4 bash -c 'echo > /dev/tcp/$host/$porta'"; then
    verde "$nome alcançável em $host:$porta"
  else
    vermelho "$nome NÃO alcançável em $host:$porta a partir do CT $CT"
    info "Sem isso a API sobe e morre no primeiro acesso ao banco."
  fi
}
testar_porta "$INFRA_IP" 5432 "PostgreSQL"
testar_porta "$INFRA_IP" 6379 "Redis"

# Credenciais só dá para conferir com o .env preenchido.
if [[ -f "$RAIZ/infra/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$RAIZ/infra/.env"; set +a
  if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
    if no_ct "docker run --rm -e PGPASSWORD='${POSTGRES_PASSWORD}' postgres:17-alpine psql -h ${POSTGRES_HOST:-$INFRA_IP} -U ${POSTGRES_USER:-myhome} -d ${POSTGRES_DB:-myhome} -tAc 'SELECT 1'" | grep -q 1; then
      verde "Credenciais do banco funcionam (${POSTGRES_USER:-myhome}@${POSTGRES_DB:-myhome})"
    else
      amarelo "Não consegui autenticar no banco com as credenciais do .env"
      info "O bootstrap cria o papel e o banco no CT 102 se rodar a partir do host."
    fi
  fi
fi

# ---------------------------------------------------------
secao "Portas internas do my Home"

for par in "${WEB_PORT:-3060}:web" "${API_PORT:-3061}:api"; do
  porta="${par%%:*}"; nome="${par##*:}"
  EM_USO=$(no_ct "ss -lntH 'sport = :$porta' | head -1")
  if [[ -z "$EM_USO" ]]; then
    verde "Porta $porta ($nome) livre no CT $CT"
  elif no_ct "docker ps --format '{{.Names}} {{.Ports}}' | grep -q ':$porta->'"; then
    amarelo "Porta $porta ($nome) já usada pelo próprio my Home — atualização, não conflito"
  else
    vermelho "Porta $porta ($nome) ocupada por outro serviço no CT $CT"
    info "Escolha outra em infra/.env e ajuste a rota do túnel."
  fi
done

# ---------------------------------------------------------
secao "Configuração"

if [[ -f "$RAIZ/infra/.env" ]]; then
  verde "infra/.env existe"
  for chave in POSTGRES_PASSWORD JWT_SECRET; do
    valor="${!chave:-}"
    if [[ -z "$valor" ]]; then
      amarelo "$chave vazio — o bootstrap gera automaticamente"
    elif [[ "$chave" == "JWT_SECRET" && ${#valor} -lt 32 ]]; then
      vermelho "JWT_SECRET tem ${#valor} caracteres — mínimo 32 em produção"
    else
      verde "$chave definido"
    fi
  done
else
  amarelo "infra/.env ainda não existe"
  info "Crie com: cp infra/.env.example infra/.env"
fi

# ---------------------------------------------------------
secao "Cloudflare Tunnel"

for dominio in myhome.norty.com.br api-myhome.norty.com.br; do
  RESOLVIDO=$(getent ahostsv4 "$dominio" 2>/dev/null | awk 'NR==1 {print $1}')
  if [[ -n "$RESOLVIDO" ]]; then
    verde "$dominio resolve ($RESOLVIDO)"
  else
    amarelo "$dominio ainda não resolve"
    info "Crie a rota no túnel; o DNS é gerenciado pela Cloudflare."
  fi
done
info "Destinos esperados:  myhome → http://$CT_IP:${WEB_PORT:-3060}"
info "                     api-myhome → http://$CT_IP:${API_PORT:-3061}"

# ---------------------------------------------------------
printf '\n\033[1;34m%s\033[0m\n' "Resultado"
printf '  %d ok · %d aviso(s) · %d erro(s)\n\n' "$OK" "$AVISOS" "$ERROS"

if (( ERROS > 0 )); then
  printf '  \033[1;31mCorrija os itens marcados com ✗ antes de rodar o bootstrap.\033[0m\n\n'
  exit 1
fi
(( AVISOS > 0 )) && printf '  \033[1;33mDá para seguir, mas revise os avisos.\033[0m\n'
printf '  Próximo passo:  ./scripts/bootstrap.sh --demo\n\n'
