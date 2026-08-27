#!/usr/bin/env bash
#
# my Home by norty — diagnóstico antes do deploy.
#
#   ./scripts/preflight.sh
#
# Só lê e reporta: não instala, não sobe nada, não altera arquivo nenhum.
# Serve para descobrir o que falta *antes* de rodar o bootstrap, em vez de
# no meio dele — um deploy que falha na etapa 5 deixa contêineres subindo
# pela metade e é mais chato de diagnosticar do que uma lista de pendências.

set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

OK=0; AVISOS=0; ERROS=0

verde()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; OK=$((OK+1)); }
amarelo() { printf '  \033[1;33m!\033[0m %s\n' "$*"; AVISOS=$((AVISOS+1)); }
vermelho(){ printf '  \033[1;31m✗\033[0m %s\n' "$*"; ERROS=$((ERROS+1)); }
info()    { printf '    \033[2m%s\033[0m\n' "$*"; }
secao()   { printf '\n\033[1;34m%s\033[0m\n' "$*"; }

# ---------------------------------------------------------
secao "Máquina"

info "$(uname -srm)"
[[ -r /etc/os-release ]] && info "$(. /etc/os-release && echo "$PRETTY_NAME")"

MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
if   (( MEM_MB >= 3500 )); then verde "Memória: ${MEM_MB} MB"
elif (( MEM_MB >= 1800 )); then amarelo "Memória: ${MEM_MB} MB — suficiente, mas o build das imagens pode ficar lento"
else vermelho "Memória: ${MEM_MB} MB — abaixo do mínimo prático (2 GB)"; fi

DISCO_GB=$(df -BG --output=avail "$RAIZ" 2>/dev/null | tail -1 | tr -dc '0-9')
DISCO_GB=${DISCO_GB:-0}
if   (( DISCO_GB >= 15 )); then verde "Disco livre: ${DISCO_GB} GB"
elif (( DISCO_GB >= 8 ));  then amarelo "Disco livre: ${DISCO_GB} GB — as imagens e o banco ocupam ~6 GB"
else vermelho "Disco livre: ${DISCO_GB} GB — insuficiente"; fi

# Relógio torto quebra duas coisas silenciosamente: a validação do
# certificado TLS e a expiração do token JWT.
if command -v timedatectl >/dev/null 2>&1; then
  if timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -q yes; then
    verde "Relógio sincronizado por NTP"
  else
    amarelo "Relógio não sincronizado — habilite NTP (sudo timedatectl set-ntp true)"
    info "Relógio fora de hora invalida certificado TLS e expira sessões cedo demais."
  fi
fi

# ---------------------------------------------------------
secao "Docker"

if command -v docker >/dev/null 2>&1; then
  verde "Docker instalado: $(docker --version | cut -d, -f1)"
else
  vermelho "Docker não encontrado"
  info "Instale com: curl -fsSL https://get.docker.com | sh"
fi

if docker compose version >/dev/null 2>&1; then
  verde "Docker Compose v2: $(docker compose version --short 2>/dev/null)"
else
  vermelho "Docker Compose v2 ausente (o comando é 'docker compose', com espaço)"
fi

if docker info >/dev/null 2>&1; then
  verde "Daemon do Docker acessível pelo seu usuário"
else
  if sudo -n docker info >/dev/null 2>&1; then
    amarelo "Docker só responde com sudo"
    info "Resolva com: sudo usermod -aG docker \$USER — depois saia e entre de novo."
  else
    vermelho "Daemon do Docker não está rodando"
    info "Suba com: sudo systemctl enable --now docker"
  fi
fi

# ---------------------------------------------------------
secao "Portas 80 e 443"

porta_ocupada() {
  local porta="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lntH "sport = :$porta" 2>/dev/null | grep -q . && return 0
  elif command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$porta$" && return 0
  fi
  return 1
}

for porta in 80 443; do
  if porta_ocupada "$porta"; then
    QUEM=$(ss -lntpH "sport = :$porta" 2>/dev/null | grep -oE 'users:\(\("[^"]+' | head -1 | cut -d'"' -f2)
    amarelo "Porta $porta já está em uso${QUEM:+ por '$QUEM'}"
    info "O Caddy precisa dela. Pare o serviço concorrente ou troque a porta no compose."
  else
    verde "Porta $porta livre"
  fi
done

# ---------------------------------------------------------
secao "Rede e DNS"

IP_PUBLICO=""
for servico in "https://api.ipify.org" "https://ifconfig.me/ip" "https://icanhazip.com"; do
  IP_PUBLICO=$(curl -fsS --max-time 8 "$servico" 2>/dev/null | tr -d '[:space:]')
  [[ -n "$IP_PUBLICO" ]] && break
done

if [[ -n "$IP_PUBLICO" ]]; then
  verde "IP público deste servidor: $IP_PUBLICO"
else
  amarelo "Não consegui descobrir o IP público (sem internet de saída?)"
fi

APP_DOMAIN="${APP_DOMAIN:-myhome.norty.com.br}"
API_DOMAIN="${API_DOMAIN:-api-myhome.norty.com.br}"
if [[ -f "$RAIZ/infra/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$RAIZ/infra/.env"; set +a
fi

resolver() {
  if command -v dig >/dev/null 2>&1; then dig +short A "$1" | tail -1
  elif command -v host >/dev/null 2>&1; then host -t A "$1" 2>/dev/null | awk '/has address/ {print $NF}' | tail -1
  elif command -v getent >/dev/null 2>&1; then getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1 {print $1}'
  fi
}

for dominio in "$APP_DOMAIN" "$API_DOMAIN"; do
  RESOLVIDO=$(resolver "$dominio")
  if [[ -z "$RESOLVIDO" ]]; then
    vermelho "$dominio não resolve"
    info "Crie um registro A apontando para ${IP_PUBLICO:-<IP deste servidor>}."
  elif [[ -n "$IP_PUBLICO" && "$RESOLVIDO" != "$IP_PUBLICO" ]]; then
    vermelho "$dominio aponta para $RESOLVIDO, não para $IP_PUBLICO"
    info "O Let's Encrypt valida pelo DNS público: enquanto isso não bater, o certificado não é emitido."
  else
    verde "$dominio → $RESOLVIDO"
  fi
done

# As portas precisam chegar de fora, não só estar livres aqui dentro.
# É a diferença entre "o Caddy consegue escutar" e "o Let's Encrypt
# consegue alcançar o Caddy" — e é onde a maioria dos deploys trava.
if [[ -n "$IP_PUBLICO" ]]; then
  ALCANCE=$(curl -fsS --max-time 10 "https://portquiz.net:80" -o /dev/null -w '%{http_code}' 2>/dev/null || echo "")
  if [[ "$ALCANCE" == "200" ]]; then
    verde "Saída pela porta 80 funciona"
  else
    amarelo "Não confirmei a saída pela porta 80"
  fi
  amarelo "Entrada nas portas 80/443 não dá para testar de dentro"
  info "Confirme no roteador: redirecionamento de 80 e 443 para este servidor."
  info "De fora da sua rede (4G do celular, por exemplo): curl -I http://$IP_PUBLICO"
fi

# ---------------------------------------------------------
secao "Configuração"

if [[ -f "$RAIZ/infra/.env" ]]; then
  verde "infra/.env existe"
  for chave in ACME_EMAIL POSTGRES_PASSWORD JWT_SECRET; do
    valor="${!chave:-}"
    if [[ -z "$valor" ]]; then
      if [[ "$chave" == "ACME_EMAIL" ]]; then
        vermelho "$chave vazio — o Let's Encrypt exige um e-mail válido"
      else
        amarelo "$chave vazio — o bootstrap gera automaticamente"
      fi
    elif [[ "$chave" == "JWT_SECRET" && ${#valor} -lt 32 ]]; then
      vermelho "JWT_SECRET tem ${#valor} caracteres — mínimo 32 em produção"
    else
      verde "$chave definido"
    fi
  done
else
  amarelo "infra/.env ainda não existe"
  info "Crie com: cp infra/.env.example infra/.env — e preencha ACME_EMAIL."
fi

# ---------------------------------------------------------
printf '\n\033[1;34m%s\033[0m\n' "Resultado"
printf '  %d ok · %d aviso(s) · %d erro(s)\n\n' "$OK" "$AVISOS" "$ERROS"

if (( ERROS > 0 )); then
  printf '  \033[1;31mCorrija os itens marcados com ✗ antes de rodar o bootstrap.\033[0m\n\n'
  exit 1
fi

if (( AVISOS > 0 )); then
  printf '  \033[1;33mDá para seguir, mas revise os avisos.\033[0m\n'
fi
printf '  Próximo passo:  ./scripts/bootstrap.sh --demo\n\n'
