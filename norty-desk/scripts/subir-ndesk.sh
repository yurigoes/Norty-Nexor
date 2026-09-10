#!/usr/bin/env bash
# Sobe o Norty Desk na VM NDesk, publicado por túnel em
# chamados.norty.com.br. Rode DENTRO da VM, na raiz do repositório.
#
# É idempotente: rodar de novo reconstrói e migra sem perder dado.
set -euo pipefail

cd "$(dirname "$0")/.."
titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
falhar() { printf '\n\033[31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

titulo "Pré-requisitos"
command -v docker >/dev/null || falhar "docker não está instalado nesta VM."
docker compose version >/dev/null 2>&1 || falhar "falta o plugin 'docker compose'."
echo "  docker: $(docker --version)"

# O token do túnel é o que diferencia esta VM de qualquer outra máquina
# que rode o mesmo código. Sem ele o compose nem sobe — e é melhor
# falhar aqui, com a mensagem certa, que subir sem porta de entrada.
[ -f infra/.env ] || falhar "falta infra/.env — copie de infra/.env.exemplo e preencha TUNNEL_TOKEN."
grep -qE '^TUNNEL_TOKEN=.+' infra/.env || falhar "TUNNEL_TOKEN vazio em infra/.env."
echo "  infra/.env: presente, com token"

[ -f apps/api/.env ] || falhar "falta apps/api/.env — copie de apps/api/.env.example."
grep -qE '^DATABASE_URL=.+' apps/api/.env || falhar "DATABASE_URL vazio em apps/api/.env."

# O domínio precisa bater com o do túnel: é ele que assina o cookie de
# sessão e monta o Message-ID do e-mail. Errar aqui dá login que não
# gruda e resposta de e-mail que não volta para o chamado.
origem=$(grep -E '^WEB_ORIGIN=' apps/api/.env | cut -d= -f2- || true)
case "$origem" in
  https://chamados.norty.com.br) echo "  WEB_ORIGIN: $origem";;
  "") falhar "WEB_ORIGIN não definido em apps/api/.env.";;
  *) printf '  \033[33maviso:\033[0m WEB_ORIGIN é "%s", e o túnel publica chamados.norty.com.br.\n' "$origem";;
esac

titulo "A infra compartilhada responde?"
# Banco, Redis, MinIO e Evolution vivem no CT 102. Se a VM nova não
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
[ "$falta" = 1 ] && falhar "sem banco não adianta subir. Verifique a rota da VM até o CT 102."

titulo "Construir e subir"
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build

titulo "Migrar o banco"
docker compose -f infra/docker-compose.yml --env-file infra/.env \
  exec -T desk-api npx prisma migrate deploy

titulo "Estado"
docker compose -f infra/docker-compose.yml --env-file infra/.env ps

titulo "O túnel subiu?"
sleep 5
if docker logs desk-tunnel 2>&1 | tail -20 | grep -qiE 'registered tunnel connection|connection established'; then
  echo "  túnel conectado à Cloudflare"
else
  printf '  \033[33mainda não confirmou conexão. Veja:\033[0m docker logs -f desk-tunnel\n'
fi

cat <<'FINAL'

Pronto.

  Aplicativo:  https://chamados.norty.com.br
  Retaguarda:  https://desk.norty.com.br  (heimdall — não foi tocado)

Primeiro acesso: semeie a estrutura base uma única vez, com
  docker compose -f infra/docker-compose.yml --env-file infra/.env \
    exec -T desk-api npm run db:seed -w @norty-desk/api

Nada nesta VM escuta em 80 ou 443: quem publica é o túnel.
FINAL
