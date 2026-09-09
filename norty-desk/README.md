# Norty Desk

Central de serviços da Norty — um GLPI remodelado.

O GLPI resolve o problema certo (ITIL de verdade: chamado, SLA, base de
conhecimento, aprovação, ativos) com uma casca de 2009: PHP monolítico,
315 páginas em `front/`, sessão com estado, permissão em bitmask e uma
API REST que exige `session_token` e conhece campos por número
(`searchOption: 12`). Este projeto mantém o **domínio** e joga fora a
**implementação**.

```
desk.norty.com.br      → apps/web    (React + Vite)
desk.norty.com.br/api  → apps/api    (NestJS + Prisma + PostgreSQL)
```

## Estado

**Fase 0 — discovery e scaffold.** O que existe aqui hoje:

| Entrega | Onde | Estado |
|---|---|---|
| Mapa do GLPI 11.0.9 | `docs/01-glpi-mapa.md` | pronto |
| Gap analysis (mantém / muda / melhora / corta) | `docs/02-gap-analysis.md` | pronto |
| Modelo de dados + rastreabilidade GLPI→Desk | `docs/03-modelo-de-dados.md` | pronto |
| Perfis e matriz de permissões | `docs/04-rbac.md` | pronto |
| SLA, OLA, calendário e escalonamento | `docs/05-sla.md` | pronto |
| Canais: e-mail e WhatsApp Evolution | `docs/06-canais.md` | pronto |
| Contratos de API | `docs/07-api.md` | pronto |
| Design system e telas | `docs/08-design.md` | pronto |
| Migração de dados do GLPI | `docs/09-migracao.md` | pronto |
| Roadmap por fases | `docs/10-roadmap.md` | pronto |
| Deploy no Proxmox | `docs/11-infra.md` | pronto |
| Domínio compartilhado (TypeScript) | `packages/shared` | scaffold |
| Schema Prisma | `apps/api/prisma/schema.prisma` | scaffold |
| API NestJS | `apps/api` | scaffold |
| Aplicativo React | `apps/web` | scaffold |

Scaffold significa: compila, tem a forma certa e os contratos corretos —
mas os módulos de negócio ainda não estão implementados. A ordem de
implementação está em `docs/10-roadmap.md`.

## Por onde começar a ler

1. `docs/00-visao.md` — o produto em uma página.
2. `docs/02-gap-analysis.md` — a resposta direta a "o que melhora e o que muda".
3. `docs/03-modelo-de-dados.md` — o modelo, com cada entidade rastreada até a tabela do GLPI que ela substitui.

## Comandos

```bash
npm install              # instala o monorepo
npm run dev:web          # aplicativo em http://localhost:5174
npm run dev:api          # API em http://localhost:3061/v1
npm run build            # shared → api → web, nesta ordem
npm run lint

# Banco (precisa de DATABASE_URL em apps/api/.env)
npm run db:migrate
npm run db:seed
npm run db:studio
```

## Este projeto ainda mora dentro do Norty-Nexor

O código foi escrito na pasta `norty-desk/` do repositório
`yurigoes/Norty-Nexor` porque a sessão que o gerou não tinha acesso ao
servidor `thor` para criar o repositório definitivo. Ele é
autocontido — nada aqui importa de `apps/` ou `packages/` do my Home.

Para extraí-lo como repositório próprio:

```bash
# no thor
mkdir -p /srv/apps-fase3/norty-desk
# copie o conteúdo de norty-desk/ para lá, então:
cd /srv/apps-fase3/norty-desk
git init && git add . && git commit -m "Importa o projeto Norty Desk"
```

O deploy está descrito em `docs/11-infra.md` (CT 105 Asgard, banco no
CT 102 Yggdrasil).
