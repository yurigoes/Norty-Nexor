#!/usr/bin/env bash
#
# Coleta a identidade visual do licita para servir de referência ao
# Norty Desk (docs/08-design.md, seção 0).
#
# Rode NO HOST thor, como root:
#     bash coletar-licita.sh
#
# É SOMENTE LEITURA: só lista, lê e copia arquivos. Não reinicia
# serviço, não escreve em container, não toca em banco. O resultado sai
# em /tmp/licita-design-<data>.tar.gz — confira o conteúdo antes de
# enviar.

set -uo pipefail

SAIDA="/tmp/licita-design-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SAIDA"
CTS="${CTS:-100 101 102 103 104 105 106 107}"
ALVO="${ALVO:-licita}"

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------
# 1. Inventário dos containers
# ---------------------------------------------------------------------
log "Containers"
pct list 2>&1 | tee "$SAIDA/00-pct-list.txt"

# ---------------------------------------------------------------------
# 2. Onde está o licita
#
# Procura em três lugares, do mais barato para o mais caro: nome de
# container Docker, arquivo de compose, e configuração do Caddy.
# ---------------------------------------------------------------------
log "Procurando '$ALVO' nos containers"
CT_ENCONTRADO=""
CAMINHO_ENCONTRADO=""

for ct in $CTS; do
  pct status "$ct" 2>/dev/null | grep -q running || continue

  achados=$(pct exec "$ct" -- sh -c "
    docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null | grep -i '$ALVO'
    find /opt /srv -maxdepth 4 -iname '*$ALVO*' 2>/dev/null | head -20
    grep -ril '$ALVO' /etc/caddy /opt/*/Caddyfile /opt/*/*/Caddyfile 2>/dev/null | head -10
  " 2>/dev/null)

  if [ -n "$achados" ]; then
    echo "--- CT $ct ---" | tee -a "$SAIDA/01-localizacao.txt"
    echo "$achados"        | tee -a "$SAIDA/01-localizacao.txt"
    [ -z "$CT_ENCONTRADO" ] && CT_ENCONTRADO="$ct"
  fi
done

if [ -z "$CT_ENCONTRADO" ]; then
  echo
  echo "Não achei nada com '$ALVO' nos CTs $CTS."
  echo "Se o app tem outro nome interno, rode:  ALVO=<nome> bash $0"
  echo "Se está noutro CT:                      CTS='108 109' bash $0"
  exit 1
fi

log "licita parece estar no CT $CT_ENCONTRADO"

# ---------------------------------------------------------------------
# 3. Estrutura e stack do app
# ---------------------------------------------------------------------
log "Estrutura e stack"
CAMINHO_ENCONTRADO=$(pct exec "$CT_ENCONTRADO" -- sh -c \
  "find /opt /srv -maxdepth 4 -iname '*$ALVO*' -type d 2>/dev/null | head -1")

echo "Caminho: ${CAMINHO_ENCONTRADO:-não localizado}" | tee "$SAIDA/02-stack.txt"

if [ -n "$CAMINHO_ENCONTRADO" ]; then
  pct exec "$CT_ENCONTRADO" -- sh -c "
    echo '--- árvore (2 níveis) ---'
    find '$CAMINHO_ENCONTRADO' -maxdepth 2 -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -60
    echo
    echo '--- package.json ---'
    cat '$CAMINHO_ENCONTRADO/package.json' 2>/dev/null | head -60
    echo
    echo '--- docker-compose ---'
    cat '$CAMINHO_ENCONTRADO/docker-compose.yml' '$CAMINHO_ENCONTRADO/docker-compose.yaml' 2>/dev/null | head -60
  " 2>&1 | tee -a "$SAIDA/02-stack.txt"
fi

# ---------------------------------------------------------------------
# 4. O que interessa: os tokens de design
#
# Procura config de Tailwind e as folhas de estilo, tanto no fonte
# quanto no build servido.
# ---------------------------------------------------------------------
log "Configuração de tema (Tailwind, tokens, fontes)"
pct exec "$CT_ENCONTRADO" -- sh -c "
  for arquivo in \$(find '$CAMINHO_ENCONTRADO' \
       \\( -name 'tailwind.config.*' -o -name 'theme.*' -o -name 'tokens.*' \
          -o -name 'globals.css' -o -name 'index.css' -o -name 'app.css' \
          -o -name 'variables.css' -o -name '_variables.scss' \\) \
       -not -path '*/node_modules/*' 2>/dev/null | head -12); do
    echo \"########## \$arquivo ##########\"
    head -200 \"\$arquivo\"
    echo
  done
" 2>&1 | tee "$SAIDA/03-tema-fonte.txt"

log "CSS compilado (o que o navegador realmente recebe)"
pct exec "$CT_ENCONTRADO" -- sh -c "
  find '$CAMINHO_ENCONTRADO' \\( -path '*/dist/*' -o -path '*/build/*' -o -path '*/.next/*' \\) \
    -name '*.css' -not -path '*/node_modules/*' 2>/dev/null | head -5 | while read -r css; do
      echo \"########## \$css ##########\"

      echo '--- variáveis CSS declaradas ---'
      grep -oE '\\-\\-[a-zA-Z0-9-]+:[^;}]+' \"\$css\" 2>/dev/null | sort -u | head -120

      echo
      echo '--- cores mais usadas ---'
      grep -oE '#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}\\b' \"\$css\" 2>/dev/null \
        | tr 'A-F' 'a-f' | sort | uniq -c | sort -rn | head -30

      echo
      echo '--- fontes ---'
      grep -oE 'font-family:[^;}]+' \"\$css\" 2>/dev/null | sort -u | head -12

      echo
      echo '--- raios de canto ---'
      grep -oE 'border-radius:[^;}]+' \"\$css\" 2>/dev/null | sort | uniq -c | sort -rn | head -12

      echo
      echo '--- sombras ---'
      grep -oE 'box-shadow:[^;}]+' \"\$css\" 2>/dev/null | sort -u | head -10
      echo
  done
" 2>&1 | tee "$SAIDA/04-css-compilado.txt"

# ---------------------------------------------------------------------
# 5. O HTML servido, para eu ver a estrutura do shell
# ---------------------------------------------------------------------
log "HTML servido"
PORTA=$(pct exec "$CT_ENCONTRADO" -- sh -c \
  "docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -i '$ALVO' \
   | grep -oE '0.0.0.0:[0-9]+' | head -1 | cut -d: -f2")

if [ -n "$PORTA" ]; then
  echo "Porta interna: $PORTA" | tee "$SAIDA/05-html.txt"
  pct exec "$CT_ENCONTRADO" -- sh -c \
    "curl -s --max-time 10 http://localhost:$PORTA/ | head -200" 2>&1 \
    | tee -a "$SAIDA/05-html.txt"
else
  echo "Não descobri a porta publicada; pegue o HTML pelo navegador." \
    | tee "$SAIDA/05-html.txt"
fi

# ---------------------------------------------------------------------
# 6. Cópia das folhas de estilo, para leitura integral
# ---------------------------------------------------------------------
log "Copiando folhas de estilo"
mkdir -p "$SAIDA/css"
pct exec "$CT_ENCONTRADO" -- sh -c \
  "find '$CAMINHO_ENCONTRADO' -name '*.css' -not -path '*/node_modules/*' \
   -size -2M 2>/dev/null | head -10" 2>/dev/null | while read -r css; do
    [ -n "$css" ] || continue
    destino="$SAIDA/css/$(echo "$css" | tr '/' '_')"
    pct pull "$CT_ENCONTRADO" "$css" "$destino" 2>/dev/null \
      && echo "  copiado: $css"
done

# ---------------------------------------------------------------------
log "Empacotando"
tar -czf "$SAIDA.tar.gz" -C "$(dirname "$SAIDA")" "$(basename "$SAIDA")"

cat <<FIM

Pronto.

  Pacote:  $SAIDA.tar.gz
  Bruto:   $SAIDA/

Confira o conteúdo antes de enviar — em especial 02-stack.txt, que pode
ter variável de ambiente com segredo:

  grep -rniE 'senha|password|secret|token|api[_-]?key' "$SAIDA/"

O que eu mais preciso, em ordem: 03-tema-fonte.txt, 04-css-compilado.txt
e duas capturas de tela (uma listagem e uma tela de detalhe).
FIM
