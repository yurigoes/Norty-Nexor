FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages/shared packages/shared
RUN npm run build -w @norty-desk/shared

COPY apps/web apps/web
# Base da API gravada no bundle. Sem isto o Vite cai no padrão do código
# (`/v1`, que só existe no proxy do `vite dev`) e, em produção, o login vai
# para /v1/auth/login: o nginx entrega o index.html do SPA e o POST volta
# 405 — "Não foi possível falar com o servidor". O nginx só encaminha /api/.
# (E `GET /v1/health` responde 200 com o index.html, o que engana o teste.)
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @norty-desk/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
