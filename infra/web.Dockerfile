# =========================================================
#  Aplicativo web do my Home — imagem de produção
# ---------------------------------------------------------
#  Compila o bundle e serve por nginx. O endereço da API entra em
#  tempo de build porque o Vite substitui `import.meta.env` no bundle:
#  não há como trocá-lo depois sem recompilar.
# =========================================================

FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ARG VITE_DATA_SOURCE=api
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DATA_SOURCE=$VITE_DATA_SOURCE

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspaces --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @myhome/shared && npm run build -w @myhome/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
