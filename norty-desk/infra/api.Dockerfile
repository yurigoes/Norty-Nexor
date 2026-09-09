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
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @norty-desk/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# argon2 é nativo: precisa das libs de runtime, não das de build.
RUN apk add --no-cache libstdc++

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
