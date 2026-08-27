# =========================================================
#  LICITA+ — imagem de produção (Thor / LXC)
# ---------------------------------------------------------
#  O contexto de build é o próprio diretório do app, porque no
#  Thor o código mora em /srv/apps-fase<N>/licita-mais e entra no
#  container por bind-mount em /opt/fase<N>/licita-mais — não há
#  raiz de monorepo lá dentro.
#
#  Não há passo de compilação: o app é HTML, CSS e módulos ES
#  servidos como estão, então o que roda em produção é exatamente
#  o que está no disco. O primeiro estágio existe só para rodar a
#  verificação estática — nome de topo duplicado, import sem
#  extensão ou cor literal fora dos tokens impedem a imagem de
#  ser gerada.
# =========================================================

FROM node:22-alpine AS verificacao
WORKDIR /app
COPY index.html ./
COPY src ./src
COPY scripts ./scripts
RUN node scripts/verificar.mjs

FROM nginx:1.27-alpine AS runtime
COPY --from=verificacao /app/index.html /usr/share/nginx/html/
COPY --from=verificacao /app/src /usr/share/nginx/html/src
COPY deploy.nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# O ingress precisa saber se a aplicação está de pé antes de
# mandar tráfego. `wget -q -O-` existe no alpine sem instalar nada.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
