# =========================================================
#  Norty Car — API (imagem de produção)
# ---------------------------------------------------------
#  Build em estágios: o runtime não leva compilador nem fonte.
#  O Prisma Client é gerado DENTRO do Alpine, então o motor de
#  consulta sai compilado para linux-musl (o do host não serviria).
# =========================================================

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl dumb-init

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/car-shared/package.json packages/car-shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/car-api/package.json apps/car-api/
COPY apps/car-web/package.json apps/car-web/
RUN npm ci --workspaces --include-workspace-root

FROM deps AS build
COPY packages/car-shared packages/car-shared
COPY apps/car-api apps/car-api
RUN npm run build -w @nortycar/shared \
 && npm run build -w @nortycar/api

FROM base AS runtime
ENV NODE_ENV=production
# Nunca como root: uma falha na aplicação não vira acesso à máquina.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nortycar -G nodejs \
 && mkdir -p /data/storage && chown nortycar:nodejs /data/storage

COPY --from=build --chown=nortycar:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nortycar:nodejs /app/packages/car-shared/dist ./packages/car-shared/dist
COPY --from=build --chown=nortycar:nodejs /app/packages/car-shared/package.json ./packages/car-shared/
COPY --from=build --chown=nortycar:nodejs /app/apps/car-api/dist ./apps/car-api/dist
COPY --from=build --chown=nortycar:nodejs /app/apps/car-api/prisma ./apps/car-api/prisma
COPY --from=build --chown=nortycar:nodejs /app/apps/car-api/src/generated ./apps/car-api/src/generated
COPY --from=build --chown=nortycar:nodejs /app/apps/car-api/package.json ./apps/car-api/

USER nortycar
WORKDIR /app/apps/car-api
ENV STORAGE_DIR=/data/storage
EXPOSE 3334
# dumb-init repassa SIGTERM: o Node como PID 1 ignoraria o sinal e o
# `docker compose down` mataria a API no meio de uma transação.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
