# my Home by norty — atalhos de operação.
.PHONY: help setup up down logs ps migrate seed seed-demo backup restore shell-api shell-db build

help: ## Mostra estes comandos
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## Instala e sobe tudo pela primeira vez
	./scripts/bootstrap.sh

setup-demo: ## Igual ao setup, com dados de demonstração
	./scripts/bootstrap.sh --demo

up: ## Sobe os serviços
	docker compose -f infra/docker-compose.yml --env-file infra/.env up -d

down: ## Para os serviços
	docker compose -f infra/docker-compose.yml --env-file infra/.env down

logs: ## Acompanha os logs
	docker compose -f infra/docker-compose.yml --env-file infra/.env logs -f --tail=100

ps: ## Estado dos contêineres
	docker compose -f infra/docker-compose.yml --env-file infra/.env ps

build: ## Reconstrói as imagens
	docker compose -f infra/docker-compose.yml --env-file infra/.env build --pull

migrate: ## Aplica migrações pendentes
	docker compose -f infra/docker-compose.yml --env-file infra/.env run --rm --entrypoint sh api -c 'npx prisma migrate deploy'

seed: ## Semeia a estrutura base
	docker compose -f infra/docker-compose.yml --env-file infra/.env run --rm --entrypoint sh api -c 'npx tsx prisma/seed.ts'

backup: ## Copia o banco para infra/backup
	@mkdir -p infra/backup
	docker compose -f infra/docker-compose.yml --env-file infra/.env exec -T db \
		pg_dump -U $${POSTGRES_USER:-myhome} -d $${POSTGRES_DB:-myhome} -Fc \
		> infra/backup/myhome-$$(date +%Y%m%d-%H%M%S).dump
	@echo "Backup salvo em infra/backup/"

shell-api: ## Abre um shell no contêiner da API
	docker compose -f infra/docker-compose.yml --env-file infra/.env exec api sh

shell-db: ## Abre o psql
	docker compose -f infra/docker-compose.yml --env-file infra/.env exec db psql -U $${POSTGRES_USER:-myhome} -d $${POSTGRES_DB:-myhome}
