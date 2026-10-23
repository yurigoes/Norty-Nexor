# =========================================================
#  Norty Car — aplicativo web e sites públicos (nginx)
# ---------------------------------------------------------
#  O mesmo bundle atende o aplicativo (hosts em VITE_APP_HOSTS)
#  e os sites das locadoras (qualquer outro host). O endereço da
#  API entra no build: o Vite grava o valor dentro do bundle.
# =========================================================

FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ARG VITE_APP_HOSTS
ENV VITE_API_URL=$VITE_API_URL VITE_APP_HOSTS=$VITE_APP_HOSTS

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/car-shared/package.json packages/car-shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/car-api/package.json apps/car-api/
COPY apps/car-web/package.json apps/car-web/
RUN npm ci --workspaces --include-workspace-root

COPY packages/car-shared packages/car-shared
COPY apps/car-web apps/car-web
RUN npm run build -w @nortycar/shared && npm run build -w @nortycar/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/car-web/dist /usr/share/nginx/html
COPY infra/norty-car/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
