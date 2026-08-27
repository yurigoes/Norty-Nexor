# my Home by norty — atalhos de operação.
#
# Rodam a partir do host thor e operam dentro do CT 105 Asgard.
CT  ?= 105
APP ?= /opt/fase3/my-home

.PHONY: help check setup setup-demo up down logs ps migrate seed backup shell-api shell-db build

help: ## Mostra estes comandos
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

check: ## Diagnostica a máquina antes do deploy (não altera nada)
	./scripts/preflight.sh

setup: ## Instala e sobe tudo pela primeira vez
	./scripts/bootstrap.sh

setup-demo: ## Igual ao setup, com dados de demonstração
	./scripts/bootstrap.sh --demo

up: ## Sobe os serviços
	pct exec $(CT) -- bash -lc 'cd $(APP) && docker compose -f infra/docker-compose.yml --env-file infra/.env up -d'

down: ## Para os serviços
	pct exec $(CT) -- bash -lc 'cd $(APP) && docker compose -f infra/docker-compose.yml --env-file infra/.env down'

logs: ## Acompanha os logs
	pct exec $(CT) -- bash -lc 'cd $(APP) && docker compose -f infra/docker-compose.yml --env-file infra/.env logs -f --tail=100'

ps: ## Estado dos contêineres
	pct exec $(CT) -- bash -lc 'cd $(APP) && docker compose -f infra/docker-compose.yml --env-file infra/.env ps'

build: ## Reconstrói as imagens
	pct exec $(CT) -- bash -lc 'cd $(APP) && docker compose -f infra/docker-compose.yml --env-file infra/.env build --pull'

migrate: ## Aplica migrações pendentes
	pct exec $(CT) -- bash -lc 'cd $(APP) && docker compose -f infra/docker-compose.yml --env-file infra/.env run --rm --entrypoint sh api -c 'npx prisma migrate deploy''

seed: ## Semeia a estrutura base
	pct exec $(CT) -- bash -lc 'cd $(APP) && docker compose -f infra/docker-compose.yml --env-file infra/.env run --rm --entrypoint sh api -c 'npx tsx prisma/seed.ts''

backup: ## Dump do banco a partir do CT 102 Yggdrasil
	@mkdir -p infra/backup
	pct exec 102 -- su - postgres -c "pg_dump -Fc $${POSTGRES_DB:-myhome}" > infra/backup/myhome-$$(date +%Y%m%d-%H%M%S).dump
	@echo "Backup salvo em infra/backup/"

shell-api: ## Abre um shell no contêiner da API
	pct exec $(CT) -- bash -lc 'cd $(APP) && docker compose -f infra/docker-compose.yml --env-file infra/.env exec api sh'

shell-db: ## Abre o psql no banco compartilhado (CT 102)
	pct exec 102 -- su - postgres -c "psql -d $${POSTGRES_DB:-myhome}"
