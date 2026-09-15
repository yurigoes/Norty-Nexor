#!/usr/bin/env bash
# Onde está a lentidão do Norty Desk?
#
# Mede cada camada separadamente, porque "está lento" pode ser o túnel,
# o contêiner, a API ou o banco — e tratar a camada errada custa um dia.
#
#   No host thor:   pct exec <ID> -- bash /opt/norty-desk/scripts/diagnosticar-lentidao.sh
#   Dentro da VM:   bash scripts/diagnosticar-lentidao.sh
#
# SOMENTE LEITURA. Não reinicia nada, não altera configuração.
set -uo pipefail

titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
DESK_PORT="${DESK_PORT:-3060}"
AMOSTRAS="${AMOSTRAS:-5}"

# ---------------------------------------------------------------------
titulo "A máquina aguenta?"
echo "  núcleos:  $(nproc 2>/dev/null || echo '?')"
echo "  carga:    $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || echo '?')  (compare com o número de núcleos)"
free -m 2>/dev/null | awk '/^Mem:/{printf "  memória:  %s MB usados de %s MB (livre: %s)\n",$3,$2,$7}'
free -m 2>/dev/null | awk '/^Swap:/{if($2>0 && $3>0) printf "  \033[33mSWAP EM USO: %s MB — a máquina está trocando para disco, e isso é lentidão\033[0m\n",$3}'
df -h / 2>/dev/null | awk 'NR==2{print "  disco /:  "$5" usado"}'

titulo "Os contêineres"
docker ps --format '  {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo '  (sem docker aqui)'
echo
echo "  consumo agora (uma amostra):"
docker stats --no-stream --format '  {{.Name}}\tCPU {{.CPUPerc}}\tMem {{.MemUsage}}' 2>/dev/null | head -8

# ---------------------------------------------------------------------
# O tempo até o primeiro byte é o que separa "o app é lento" de "a rede
# até o app é lenta". Medido de dentro, sem túnel e sem Cloudflare.
medir() {
  local rotulo="$1" url="$2" extra="${3:-}"
  local total=0 n=0 linha
  for _ in $(seq 1 "$AMOSTRAS"); do
    linha=$(curl -sS -o /dev/null $extra \
      -w '%{time_namelookup} %{time_connect} %{time_starttransfer} %{time_total} %{http_code}' \
      "$url" 2>/dev/null) || { printf '  %-28s (não respondeu)\n' "$rotulo"; return; }
    set -- $linha
    total=$(awk -v a="$total" -v b="$4" 'BEGIN{print a+b}')
    n=$((n+1))
    ultimo="$linha"
  done
  set -- $ultimo
  printf '  %-28s média %6.0f ms   (ttfb %.0f ms, conexão %.0f ms)  HTTP %s\n' \
    "$rotulo" "$(awk -v t="$total" -v n="$n" 'BEGIN{print t/n*1000}')" \
    "$(awk -v v="$3" 'BEGIN{print v*1000}')" "$(awk -v v="$2" 'BEGIN{print v*1000}')" "$5"
}

titulo "Latência de dentro da máquina (sem túnel, sem Cloudflare)"
medir "front (nginx)"        "http://127.0.0.1:${DESK_PORT}/"
medir "API pelo front"       "http://127.0.0.1:${DESK_PORT}/api/v1/health"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^desk-api$'; then
  echo "  API direto (de dentro do contêiner):"
  docker exec desk-api sh -c \
    "for i in 1 2 3; do wget -q -O /dev/null -T 5 http://127.0.0.1:3061/v1/health 2>/dev/null; done; \
     time wget -q -O /dev/null http://127.0.0.1:3061/v1/health" 2>&1 | grep -E 'real|não' | sed 's/^/    /'
fi

# ---------------------------------------------------------------------
titulo "O banco está longe?"
# O Postgres não mora aqui: é a infra compartilhada do CT 102. Cada
# consulta paga a ida e a volta, e uma tela que faz vinte consultas paga
# vinte vezes.
BANCO=$(grep -E '^DATABASE_URL=' /opt/norty-desk/apps/api/.env 2>/dev/null | sed -E 's#.*@([^:/]+).*#\1#')
BANCO="${BANCO:-192.168.15.72}"
echo "  host do banco: $BANCO"
if command -v ping >/dev/null 2>&1; then
  ping -c 5 -W 2 "$BANCO" 2>/dev/null | tail -2 | sed 's/^/  /' || echo "  (ping bloqueado — normal em alguns ambientes)"
fi
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^desk-api$'; then
  echo "  consulta trivial, dez vezes (mede ida e volta até o Postgres):"
  docker exec desk-api sh -c 'cd /app/apps/api && node -e "
    const { PrismaClient } = require(\"@prisma/client\");
    const p = new PrismaClient();
    (async () => {
      await p.\$queryRaw\`SELECT 1\`;
      const t = Date.now();
      for (let i = 0; i < 10; i++) await p.\$queryRaw\`SELECT 1\`;
      console.log(\"    \" + ((Date.now()-t)/10).toFixed(1) + \" ms por consulta\");
      await p.\$disconnect();
    })().catch(e => console.log(\"    falhou: \" + e.message.split(String.fromCharCode(10))[0]));
  "' 2>&1 | tail -2
fi

# ---------------------------------------------------------------------
titulo "O túnel"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^desk-tunnel$'; then
  conexoes=$(docker logs --tail 200 desk-tunnel 2>&1 | grep -c "Registered tunnel connection")
  echo "  conexões registradas (nos últimos 200 registros): $conexoes"
  echo "  o Cloudflare recomenda 4; menos que isso concentra tráfego e adiciona latência"
  echo "  erros recentes:"
  docker logs --tail 300 desk-tunnel 2>&1 | grep -iE "error|failed|retry|timeout" | tail -5 | sed 's/^/    /' \
    || echo "    (nenhum)"
else
  echo "  (sem contêiner desk-tunnel aqui)"
fi

titulo "A API está reclamando de alguma coisa?"
docker logs --tail 400 desk-api 2>&1 | grep -iE "slow|timeout|ECONNREFUSED|pool|pending|error" | tail -8 | sed 's/^/  /' \
  || echo "  (nada no log recente)"

cat <<'FINAL'

Como ler isto
-------------
  front e API rápidos aqui, lento no navegador  → é o túnel ou a
      Cloudflare, não o aplicativo. Veja o número de conexões acima.
  consulta ao banco acima de ~5 ms              → cada tela paga isso
      vezes o número de consultas; é a rota até o CT 102.
  SWAP em uso ou carga acima dos núcleos        → falta máquina.
  CPU de um contêiner encostada em 100%         → é ali.
FINAL
