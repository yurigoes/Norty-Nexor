# =========================================================
#  LICITA+ — imagem de produção
# ---------------------------------------------------------
#  Diferente do my Home, aqui não há passo de compilação: o app é
#  HTML, CSS e módulos ES servidos como estão. Nenhum bundler
#  entra no caminho, então o que roda em produção é exatamente o
#  que está no repositório.
#
#  O build só roda a verificação estática — se um nome de topo
#  duplicar, um import perder a extensão ou uma cor literal
#  escapar dos tokens, a imagem não é gerada.
# =========================================================

FROM node:22-alpine AS verificacao
WORKDIR /app
COPY apps/licita-mais apps/licita-mais
RUN cd apps/licita-mais && node scripts/verificar.mjs

FROM nginx:1.27-alpine AS runtime

COPY --from=verificacao /app/apps/licita-mais/index.html /usr/share/nginx/html/
COPY --from=verificacao /app/apps/licita-mais/src /usr/share/nginx/html/src

COPY infra/licita.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
