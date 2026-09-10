# Build do monorepo: shared -> api. A ordem importa.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci

COPY packages/shared packages/shared
RUN npm run build -w @norty-desk/shared

COPY apps/api apps/api
# Sem o pacote `openssl` o Prisma não detecta a libssl da imagem, avisa
# "defaulting to openssl-1.1.x" e gera o motor de OpenSSL 1.1 — que o
# node:20-alpine não tem (ele traz a 3). O build passa; a API sobe e
# morre no boot com `libssl.so.1.1: No such file or directory`.
# Fica aqui, e não no topo, para não invalidar o cache do `npm ci`.
RUN apk add --no-cache openssl
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @norty-desk/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# argon2 é nativo: precisa das libs de runtime, não das de build.
# openssl: o motor do Prisma gerado acima carrega a libssl 3 no boot.
RUN apk add --no-cache libstdc++ openssl

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/package.json apps/api/

WORKDIR /app/apps/api
USER node
EXPOSE 3061
CMD ["node", "dist/main.js"]
