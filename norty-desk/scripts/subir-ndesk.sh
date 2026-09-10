#!/usr/bin/env bash
# Sobe o Norty Desk na máquina NDesk, publicado em
# chamados.norty.com.br. Rode DENTRO dela, na raiz do repositório.
#
# É idempotente: rodar de novo reconstrói e migra sem perder dado.
set -euo pipefail

cd "$(dirname "$0")/.."
titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
falhar() { printf '\n\033[31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }
aviso()  { printf '  \033[33maviso:\033[0m %s\n' "$*"; }

# Valor de uma chave num .env, sem aspas. Nunca falha: chave ausente
# devolve vazio (com `set -e` + `pipefail`, um grep sem resultado
# derrubava o script no meio de uma atribuição).
valor() { { grep -E "^$2=" "$1" 2>/dev/null || true; } | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }

titulo "Pré-requisitos"
command -v docker >/dev/null || falhar "docker não está instalado nesta máquina."
docker compose version >/dev/null 2>&1 || falhar "falta o plugin 'docker compose'."
echo "  docker: $(docker --version)"

[ -f infra/.env ] || falhar "falta infra/.env — copie de infra/.env.exemplo."
[ -f apps/api/.env ] || falhar "falta apps/api/.env — copie de apps/api/.env.example."

# O modo de publicação decide o que é obrigatório (ver o topo do
# docker-compose.yml). O export garante que o compose enxergue o
# profile mesmo em versões que não leem COMPOSE_PROFILES do --env-file.
COMPOSE_PROFILES="$(valor infra/.env COMPOSE_PROFILES)"
export COMPOSE_PROFILES
PORTA="$(valor infra/.env DESK_PORT)"; PORTA="${PORTA:-3060}"

case ",$COMPOSE_PROFILES," in
  *,tunnel,*)
    MODO=proprio
    [ -n "$(valor infra/.env TUNNEL_TOKEN)" ] \
      || falhar "COMPOSE_PROFILES=tunnel sem TUNNEL_TOKEN em infra/.env."
    echo "  publicação: conector próprio (o desk-tunnel sobe aqui)"
    ;;
  *)
    MODO=externo
    bind="$(valor infra/.env DESK_BIND)"
    case "${bind:-127.0.0.1}" in
      127.*|localhost)
        falhar "conector externo com DESK_BIND=${bind:-127.0.0.1}: o conector, em outro CT, não alcança o loopback. Use DESK_BIND=0.0.0.0 em infra/.env."
        ;;
    esac
    echo "  publicação: conector externo (nenhum cloudflared nesta máquina)"
    ;;
esac

grep -qE '^DATABASE_URL=.+' apps/api/.env || falhar "DATABASE_URL vazio em apps/api/.env."
if grep -qE '^DATABASE_URL=.*:TROQUE@' apps/api/.env; then
  falhar "DATABASE_URL ainda tem a senha de exemplo (TROQUE)."
fi

# O domínio precisa bater com o do túnel: é ele que assina o cookie de
# sessão e monta o Message-ID do e-mail. Errar aqui dá login que não
# gruda e resposta de e-mail que não volta para o chamado.
origem=$(grep -E '^WEB_ORIGIN=' apps/api/.env | cut -d= -f2- || true)
case "$origem" in
  https://chamados.norty.com.br) echo "  WEB_ORIGIN: $origem";;
  "") falhar "WEB_ORIGIN não definido em apps/api/.env.";;
  *) aviso "WEB_ORIGIN é \"$origem\", e o túnel publica chamados.norty.com.br.";;
esac

# ---------------------------------------------------------------------
titulo "Segredos desta instalação"
# JWT_SECRET e CHANNEL_SECRET_KEY não vêm de ninguém: são desta máquina.
# O exemplo traz "TROQUE", e a API recusa subir com menos de 32
# caracteres — o contêiner entra em laço de reinício e o compose para
# em "dependency failed to start". Só gera quando falta: trocar o
# CHANNEL_SECRET_KEY de uma instalação em uso tornaria ilegíveis as
# senhas de canal que já estão cifradas no banco.
for par in JWT_SECRET:48 CHANNEL_SECRET_KEY:32; do
  nome="${par%%:*}"; bytes="${par##*:}"
  atual="$(valor apps/api/.env "$nome")"
  if [ "${#atual}" -ge 32 ]; then
    echo "  $nome: mantido"
    continue
  fi
  novo="$(openssl rand -hex "$bytes" 2>/dev/null || head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n')"
  if grep -qE "^$nome=" apps/api/.env; then
    sed -i -E "s|^$nome=.*|$nome=$novo|" apps/api/.env
  else
    printf '%s=%s\n' "$nome" "$novo" >> apps/api/.env
  fi
  echo "  $nome: gerado (${#novo} caracteres)"
done

# ---------------------------------------------------------------------
titulo "A infra compartilhada responde?"
# Banco, Redis, MinIO e Evolution vivem no CT 102. Se a máquina não
# alcança o CT 102, o compose sobe e a API morre no primeiro acesso —
# melhor descobrir agora que pelo log do container.
alcanca() {
  (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null && { echo "  ok   $3 ($1:$2)"; return 0; }
  printf '  \033[31mnão alcança\033[0m %s (%s:%s)\n' "$3" "$1" "$2"; return 1
}
host_banco=$(grep -E '^DATABASE_URL=' apps/api/.env | sed -E 's#.*@([^:/]+).*#\1#')
porta_banco=$(grep -E '^DATABASE_URL=' apps/api/.env | sed -E 's#.*@[^:]+:([0-9]+).*#\1#')
falta=0
alcanca "${host_banco:-192.168.15.72}" "${porta_banco:-5432}" "Postgres" || falta=1
[ "$falta" = 1 ] && falhar "sem banco não adianta subir. Verifique a rota da máquina até o CT 102."

titulo "Construir e subir"
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build

titulo "Migrar o banco"
docker compose -f infra/docker-compose.yml --env-file infra/.env \
  exec -T desk-api npx prisma migrate deploy

titulo "Estado"
docker compose -f infra/docker-compose.yml --env-file infra/.env ps

if [ "$MODO" = proprio ]; then
  titulo "O túnel subiu?"
  sleep 5
  if docker logs desk-tunnel 2>&1 | tail -20 | grep -qiE 'registered tunnel connection|connection established'; then
    echo "  túnel conectado à Cloudflare"
  else
    aviso "ainda não confirmou conexão. Veja: docker logs -f desk-tunnel"
  fi
  destino="http://desk-web:80"
else
  titulo "O front responde na porta que o conector usa?"
  if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$PORTA/"; then
    echo "  ok   front em :$PORTA"
  else
    aviso "o front não respondeu em 127.0.0.1:$PORTA."
  fi
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  destino="http://${ip:-<IP desta máquina>}:$PORTA"
fi

cat <<FINAL

Pronto.

  Aplicativo:  https://chamados.norty.com.br
  Retaguarda:  https://desk.norty.com.br  (heimdall — não foi tocado)

No painel da Cloudflare, a rota de chamados.norty.com.br aponta para:
  $destino

Primeiro acesso: semeie a estrutura base uma única vez, com
  docker compose -f infra/docker-compose.yml --env-file infra/.env \\
    exec -T desk-api npm run db:seed

Sem \`-w @norty-desk/api\`: a imagem de runtime não leva o package.json
raiz dos workspaces, e o npm responderia "No workspaces found".
FINAL
