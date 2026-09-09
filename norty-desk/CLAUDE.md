# Norty Desk — Guia do repositório

Central de serviços (service desk) da Norty. Monorepo com o aplicativo
web, a API e o domínio compartilhado entre os dois.

```
desk.norty.com.br      → apps/web    (React + Vite)
desk.norty.com.br/api  → apps/api    (NestJS + Prisma + PostgreSQL)
```

## Estrutura

```
apps/web        Aplicativo (agente, solicitante, gestor, administrador)
apps/api        API REST: auth, RBAC, multi-tenant, ITIL, canais
packages/shared Domínio, matriz de permissões e contratos de API
docs            Discovery: mapa do GLPI, gap analysis, especificações
infra           docker-compose, Caddy, Dockerfiles, .env.example
```

## Comandos

```bash
npm install              # instala o monorepo inteiro
npm run dev:api          # API em http://localhost:3061/v1
npm run dev:web          # aplicativo em http://localhost:5174
npm run build            # shared → api → web, nesta ordem
npm run typecheck

# Banco (precisa de DATABASE_URL em apps/api/.env)
npm run db:migrate       # aplica migrações
npm run db:seed          # estrutura base; DEMO=1 popula dados fictícios
npm run db:test:migrate  # migra o banco da suíte

# Suíte
npm run test -w @norty-desk/api
```

Duas armadilhas que já custaram caro aqui:

1. **A suíte precisa do `.env.test`.** Ela roda com
   `node --env-file=.env.test`, e o `ConfigModule` escolhe o arquivo por
   `NODE_ENV`. Sem isso ela apontava para o banco de desenvolvimento —
   que ela trunca a cada execução — e usava os transportes de verdade em
   vez do simulado. `limparBanco` agora recusa qualquer banco cujo nome
   não termine em `_test`.

2. **`typecheck` não pode emitir.** Era `tsc -b --noEmit false`, que
   escrevia `.js` ao lado de cada `.tsx`; o Vite resolve `./Componente`
   para o `.js` velho antes do `.tsx`, e o aplicativo congelava na versão
   do momento em que alguém rodou o typecheck. Hoje é
   `tsc -p tsconfig.json --noEmit`.

## Regras de arquitetura

1. **O domínio mora em `packages/shared`.**
   Tipos, matriz de permissões e contratos de API são compartilhados
   entre web e API. Se um campo muda, ele muda em um lugar só. Nunca
   duplique um tipo de domínio dentro de `apps/`.

2. **A mesma matriz RBAC protege o menu e a rota.**
   `ROLE_PERMISSIONS` esconde o item no aplicativo *e* alimenta o
   `PermissionsGuard` da API. Ao criar um módulo, adicione a permissão em
   `packages/shared/src/permissions.ts` e use `@RequirePermission()` no
   controller. Esconder o botão é conveniência; o guard é a proteção.

3. **Todo dado é escopado por organização.**
   O `JwtAuthGuard` resolve `request.organizationId` uma vez, validando o
   vínculo do usuário. Todo `where` de consulta começa por
   `organizationId` — nenhum service confia num id vindo do corpo da
   requisição. É o `entities_id` do GLPI, mas sem a árvore recursiva
   (ver `docs/02-gap-analysis.md`).

4. **Regra que não pode ser burlada vive no banco.**
   Número do chamado por organização, um voto de aprovação por validador
   por etapa, unicidade de `messageId` de e-mail para não duplicar
   chamado: todas são `@@unique` no schema. Validar só na aplicação deixa
   brecha para duas requisições simultâneas passarem juntas.

5. **Tempo de SLA é `Int` em segundos; dinheiro é `Decimal(12,2)`.**
   Nunca `Float` para nenhum dos dois. Na fronteira da API o Decimal vira
   `number` uma única vez, no serializador do módulo.

6. **Estilo vem de tokens, e os tokens são os do LICITA+.**
   O sistema de design é o de `@nexor/licita-mais`, adotado inteiro:
   mesma rampa, mesmos nomes, mesma cascata (`tokens → base → layout →
   components`). Dois produtos da mesma casa não devem parecer de casas
   diferentes.

   Nenhum componente escreve valor literal — se um token não existe, ele
   nasce em `apps/web/src/styles/tokens.css`.

   Papéis da paleta: `--azul-900` é superfície institucional e sidebar,
   `--azul-600` carrega ação e estado ativo, `--verde-600` é sucesso,
   `--amarelo` é acento raro.

   **O amarelo `#FFCC00` rende 1.4:1 sobre branco: nunca recebe texto
   por cima nem carrega texto sozinho.** Onde a cor precisa virar texto,
   use `--amarelo-texto`. É por isso que o botão primário é azul.

   A convenção de nomes também é a de lá: `.componente` para o bloco,
   `.componente-parte` para as partes e `.-modificador` para a variante.
   O traço inicial do modificador evita colisão na cascata.

   O que o Desk acrescenta ao sistema está marcado com `[DESK]`:
   prioridade, SLA, canal, conversa, resposta e a métrica da fila. Todos
   derivam das rampas existentes — não invente hex novo.

   Atenção a um nome: `.timeline` é a linha de **etapas** (ponto e
   conector), usada na aprovação em etapas. A linha do tempo do chamado
   é `.conversa`. Não troque os dois — o significado veio do LICITA+ e
   manter os dois produtos falando a mesma língua vale mais que o nome
   mais óbvio.

7. **Prioridade é derivada, nunca digitada.**
   `prioridade = f(urgência, impacto)` pela matriz configurável. O campo
   existe no banco porque índice e ordenação precisam dele, mas só o
   serviço de domínio escreve nele.

8. **Todo evento de chamado passa pela timeline.**
   Acompanhamento, tarefa, solução, aprovação, anexo e mudança de status
   são registros de `TicketEvent`. A tela de chamado lê a timeline, não
   quatro tabelas separadas. É a correção do maior defeito estrutural do
   GLPI (ver `docs/02-gap-analysis.md`, item 4).

## Canais de entrada

Um chamado nasce por quatro portas, e todas convergem para o mesmo caso
de uso `AbrirChamado`:

| Canal | Entrada | Documento |
|---|---|---|
| Web | `POST /v1/tickets` | `docs/07-api.md` |
| E-mail | IMAP (poll) ou webhook de entrada | `docs/06-canais.md` |
| WhatsApp | webhook da Evolution API | `docs/06-canais.md` |
| API pública | `POST /v1/intake/tickets` com chave de aplicação | `docs/07-api.md` |

Nenhum canal tem regra de negócio própria. O adaptador do canal traduz a
mensagem para o comando de domínio e mais nada.

## Idioma

Interface, comentários e commits em **português (pt-BR)**.
