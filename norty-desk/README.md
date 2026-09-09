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

**Fase 1 entregue — o chamado funciona de ponta a ponta.**

Autenticação, abertura, fila com filtros, conversa, nota interna,
atribuição, classificação, transições de status, pausa de SLA, anexos e
o portal do solicitante. Validado por 70 testes automatizados, dos quais
44 sobem a aplicação inteira contra um Postgres real, mais um passeio de
navegador que confere que a nota interna não vaza para o portal.

O que existe hoje:

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
| Domínio compartilhado (TypeScript) | `packages/shared` | pronto, 14 testes |
| Schema Prisma e migrações | `apps/api/prisma` | pronto |
| Autenticação | `apps/api/src/modules/auth` | pronto |
| Chamados | `apps/api/src/modules/tickets` | pronto |
| SLA sobre calendário | `apps/api/src/modules/sla` | pronto, 12 testes |
| Anexos | `apps/api/src/modules/attachments` | pronto |
| Catálogo (categorias, times, pessoas) | `apps/api/src/modules/catalogo` | pronto |
| Canais de e-mail e WhatsApp | `apps/api/src/modules/channels` | adaptadores prontos, processamento na Fase 2 |
| Aplicativo do agente e portal | `apps/web` | pronto |

A ordem do que vem depois está em `docs/10-roadmap.md`.

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
npm run db:migrate       # aplica as migrações
npm run db:seed          # estrutura base; DEMO=1 cria as contas de teste
npm run db:studio
```

```bash
# Testes
npm test -w @norty-desk/shared     # domínio e matriz de permissões
npm test -w @norty-desk/api        # ponta a ponta, contra Postgres real
npm run test:navegador -w @norty-desk/web   # passeio no Chromium
```

A suíte da API precisa de um banco próprio (ela trunca tudo entre
execuções) e de um `.env.test` — veja `apps/api/.env.test.example`.

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
