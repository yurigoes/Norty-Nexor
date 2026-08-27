#!/usr/bin/env bash
# =========================================================
#  Onde está o cloudflared?
# ---------------------------------------------------------
#  Roda NO HOST thor. Procura no host e dentro de cada CT.
#  Só lê — não altera nada, não reinicia nada.
#
#  Responde duas perguntas:
#    1. Em qual CT (ou no host) o cloudflared roda?
#    2. Ele usa config.yml local ou token do dashboard?
#
#  A segunda importa mais que a primeira: em modo token não
#  existe config.yml, e o ingress se edita no Cloudflare Zero
#  Trust (Networks → Tunnels → Public Hostnames). Procurar o
#  arquivo nesse caso é procurar o que não existe.
# =========================================================

set -uo pipefail

CTS="${CTS:-100 101 102 103 104 105 106 107}"

azul()    { printf '\n\033[1;34m═══ %s\033[0m\n' "$*"; }
amarelo() { printf '\033[33m%s\033[0m\n' "$*"; }
verde()   { printf '\033[32m%s\033[0m\n' "$*"; }
cinza()   { printf '\033[2m%s\033[0m\n' "$*"; }

achou_algo=0

# Recebe um prefixo de execução ("" para host, "pct exec N --" para CT)
# e um rótulo. Mantém a mesma sonda nos dois lugares.
sondar() {
  local rotulo="$1"; shift
  local -a EXEC=("$@")

  local saida=""

  # 1. Processo em execução — é a fonte mais confiável, porque
  #    mostra a linha de comando inteira (token ou --config).
  local proc
  proc="$("${EXEC[@]}" bash -c \
    'ps -eo args 2>/dev/null | grep "[c]loudflared" || true' 2>/dev/null)"

  # 2. Container Docker chamado cloudflare/tunnel/cloudflared
  local cont
  cont="$("${EXEC[@]}" bash -c \
    'command -v docker >/dev/null && docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}" 2>/dev/null | grep -i -E "cloudflare|tunnel" || true' 2>/dev/null)"

  # 3. Arquivos de configuração nos caminhos usuais
  local arquivos
  arquivos="$("${EXEC[@]}" bash -c \
    'ls -1 /etc/cloudflared/*.yml /etc/cloudflared/*.yaml \
        /root/.cloudflared/*.yml /root/.cloudflared/*.yaml \
        /home/*/.cloudflared/*.yml 2>/dev/null || true' 2>/dev/null)"

  # 4. Serviço systemd
  local svc
  svc="$("${EXEC[@]}" bash -c \
    'systemctl is-active cloudflared 2>/dev/null || true' 2>/dev/null)"

  [[ -z "$proc$cont$arquivos" && "$svc" != "active" ]] && return 1

  achou_algo=1
  azul "$rotulo"

  if [[ -n "$svc" && "$svc" == "active" ]]; then
    verde "serviço systemd: cloudflared ATIVO"
    "${EXEC[@]}" bash -c \
      'systemctl show cloudflared -p ExecStart --value 2>/dev/null | head -1' 2>/dev/null | sed 's/^/    /'
  fi

  if [[ -n "$cont" ]]; then
    verde "container Docker:"
    echo "$cont" | sed 's/^/    /'
  fi

  if [[ -n "$proc" ]]; then
    verde "processo:"
    # O token é um segredo — mostra só o começo para identificar,
    # nunca inteiro.
    echo "$proc" | sed -E 's/(--token[= ])[A-Za-z0-9._-]{12}[A-Za-z0-9._-]*/\1<TOKEN…>/g' | sed 's/^/    /'
  fi

  if [[ -n "$arquivos" ]]; then
    verde "arquivos de configuração:"
    echo "$arquivos" | sed 's/^/    /'
    echo "$arquivos" | while read -r f; do
      [[ -z "$f" ]] && continue
      cinza "    ── $f (primeiras linhas do ingress) ──"
      "${EXEC[@]}" bash -c "grep -n -A 40 '^ingress:' '$f' 2>/dev/null | head -45" 2>/dev/null \
        | sed 's/^/      /'
    done
  fi

  # ---- O veredito ----
  if grep -q -- '--token' <<<"$proc$cont" 2>/dev/null; then
    amarelo "→ MODO TOKEN: não há config.yml para editar."
    amarelo "  O ingress fica no Cloudflare Zero Trust:"
    amarelo "  Networks → Tunnels → (o túnel) → Public Hostnames → Add"
  elif [[ -n "$arquivos" ]]; then
    amarelo "→ MODO CONFIG LOCAL: edite o arquivo acima."
  fi

  return 0
}

echo "Procurando o cloudflared no host e nos CTs (só leitura)…"

sondar "HOST thor" env || cinza "host: nada"

for ct in $CTS; do
  pct status "$ct" >/dev/null 2>&1 || continue
  [[ "$(pct status "$ct" 2>/dev/null)" == "status: running" ]] || continue
  nome="$(pct config "$ct" 2>/dev/null | sed -n 's/^hostname: //p')"
  sondar "CT $ct  ${nome:-}" pct exec "$ct" -- || true
done

if [[ "$achou_algo" == "0" ]]; then
  echo
  amarelo "Nenhum cloudflared encontrado em execução."
  amarelo "Talvez o túnel rode fora do thor — no heimdall (VPS), por exemplo."
  amarelo "Ou os domínios entram por outro caminho (proxy reverso, NAT)."
  echo
  cinza "Para varrer o disco inteiro (mais lento):"
  cinza "  find / -xdev -name '*.yml' -path '*cloudflared*' 2>/dev/null"
fi

cat <<'FIM'

─────────────────────────────────────────────────────────
O que acrescentar, seja qual for o modo:

  hostname: licita.norty.com.br
  service:  http://192.168.15.73:3500

No config.yml, isso vira uma entrada da lista `ingress:` e precisa
ficar ANTES da regra final `service: http_status:404` — ela é o
catch-all e engole tudo que vier depois dela.
─────────────────────────────────────────────────────────
FIM
