# =========================================================
#  LICITA+ API — imagem de produção (Thor / LXC)
# ---------------------------------------------------------
#  O contexto de build é o diretório do app **licita-mais**, não
#  este. A razão é o bind-mount do CT 103: lá o mount é por app
#  (/srv/apps-fase1/licita-mais → /opt/licita-mais), e criar um
#  mount novo exige reiniciar o container — o que derrubaria
#  Bolão, Central de Leads e Sorva junto. Então a API viaja
#  dentro do diretório do front, em `servidor/`, e o domínio
#  compartilhado em `compartilhado/`.
#
#  Estrutura que o deploy monta no host:
#
#    /srv/apps-fase1/licita-mais/
#      index.html, src/           ← o aplicativo
#      servidor/                  ← apps/licita-api
#      compartilhado/             ← packages/licitacoes-shared
#      docker-compose.yml         ← os dois serviços
#
#  Não há raiz de monorepo lá dentro, então o package.json de
#  workspaces é escrito aqui mesmo, no build. É o que permite ao
#  npm resolver `@nexor/licitacoes-shared` como pacote local em
#  vez de procurá-lo num registry onde ele não existe.
# =========================================================

FROM node:22-alpine AS build
WORKDIR /app

# Raiz mínima de workspaces. Escrita no Dockerfile e não copiada
# do repositório porque a raiz real do monorepo não vai para o
# CT — só as duas pastas que a API precisa.
RUN printf '%s' \
  '{"name":"licita-deploy","private":true,"workspaces":["compartilhado","servidor"]}' \
  > package.json

# Manifests primeiro: com eles em camada própria, mudar código
# não invalida o cache do `npm install`.
COPY compartilhado/package.json ./compartilhado/
COPY servidor/package.json ./servidor/
RUN npm install --no-audit --no-fund

COPY compartilhado ./compartilhado
COPY servidor ./servidor

# O domínio compartilhado é consumido por `dist/cjs`, então ele
# precisa ser compilado antes da API — não é código-fonte que a
# API leia direto.
RUN npm run build -w @nexor/licitacoes-shared

WORKDIR /app/servidor
RUN npx prisma generate && npx nest build

# Poda as dependências de desenvolvimento depois do build: o
# runtime não precisa do compilador nem do CLI do Nest, e eles
# são a maior parte do peso da imagem.
WORKDIR /app
RUN npm prune --omit=dev

# ---------------------------------------------------------

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Bahia

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/compartilhado ./compartilhado
COPY --from=build /app/servidor/node_modules ./servidor/node_modules
COPY --from=build /app/servidor/package.json ./servidor/package.json
COPY --from=build /app/servidor/dist ./servidor/dist
COPY --from=build /app/servidor/gerado ./servidor/gerado
# O schema viaja junto: `prisma migrate deploy` roda na subida e
# precisa dele para saber o que aplicar.
COPY --from=build /app/servidor/prisma ./servidor/prisma

WORKDIR /app/servidor

# Não roda como root. O processo só precisa ler o próprio código
# e falar com o Postgres pela rede.
USER node

EXPOSE 3501

# O healthcheck bate na rota que toca o banco: uma API que
# responde "ok" com o Postgres fora do ar faz o orquestrador
# manter de pé um processo que não serve para nada.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:3501/v1/saude >/dev/null 2>&1 || exit 1

# Migração antes de servir. Se ela falhar, o container morre em
# vez de subir uma API contra um banco com o esquema errado.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
