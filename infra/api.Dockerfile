# =========================================================
#  API do my Home — imagem de produção
# ---------------------------------------------------------
#  Build em múltiplos estágios: o que vai para produção não carrega
#  compilador, código-fonte nem dependências de desenvolvimento.
# =========================================================

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl dumb-init

# ---- Dependências ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspaces --include-workspace-root

# ---- Compilação ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @myhome/shared \
 && npx --workspace @myhome/api prisma generate \
 && npm run build -w @myhome/api

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production

# Nunca rodar como root: uma falha na aplicação não vira acesso à máquina.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S myhome -G nodejs

COPY --from=build --chown=myhome:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=myhome:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=myhome:nodejs /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=myhome:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=myhome:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=myhome:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=myhome:nodejs /app/apps/api/package.json ./apps/api/

USER myhome
WORKDIR /app/apps/api
EXPOSE 3333

# dumb-init encaminha os sinais: sem ele o Node vira PID 1 e ignora
# SIGTERM, então `docker compose down` esperaria o timeout e mataria
# a API no meio de uma requisição.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
