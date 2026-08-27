# my Home by norty — Guia do repositório

Plataforma de gestão condominial. Monorepo com o aplicativo web, a API e
o domínio compartilhado entre os dois.

```
myhome.norty.com.br      → apps/web    (React + Vite)
api-myhome.norty.com.br  → apps/api    (NestJS + Prisma + PostgreSQL)
```

## Estrutura

```
apps/web        Aplicativo (design system próprio, 5 papéis, 50 telas)
apps/api        API REST: auth, RBAC, multi-tenant, módulos de negócio
packages/shared Domínio, matriz de permissões e contratos de API
infra           docker-compose, Caddy, Dockerfiles, .env.example
scripts         bootstrap.sh — instala e atualiza a stack num comando
```

## Comandos

```bash
npm install              # instala o monorepo inteiro
npm run dev:web          # aplicativo em http://localhost:5173
npm run dev:api          # API em http://localhost:3333/v1
npm run build            # shared → api → web, nesta ordem
npm run lint

# Banco (precisa de DATABASE_URL em apps/api/.env)
npm run db:migrate       # aplica migrações
npm run db:seed          # semeia a estrutura base
npm run db:studio

# Produção
./scripts/bootstrap.sh   # sobe tudo; --demo popula dados fictícios
make help                # atalhos de operação
```

## Regras de arquitetura

1. **O domínio mora em `packages/shared`.**
   Tipos, matriz de permissões e contratos de API são compartilhados
   entre web e API. Se um campo muda, ele muda em um lugar só — e o
   TypeScript aponta os dois lados afetados. Nunca duplique um tipo de
   domínio dentro de `apps/`.

2. **A mesma matriz RBAC protege o menu e a rota.**
   `ROLE_PERMISSIONS` esconde o item no aplicativo *e* alimenta o
   `PermissionsGuard` da API. Ao criar um módulo, adicione a permissão em
   `packages/shared/src/permissions.ts` e use `@RequirePermission()` no
   controller. Esconder o botão é conveniência; o guard é a proteção.

3. **Todo dado é escopado por condomínio.**
   O `JwtAuthGuard` resolve `request.condominiumId` uma vez, validando o
   vínculo do usuário. Todo `where` de consulta começa por
   `condominiumId` — nenhum service deve confiar num id vindo do corpo da
   requisição.

4. **Regra que não pode ser burlada vive no banco.**
   Unicidade de horário de reserva, um voto por unidade por pauta, uma
   avaliação por unidade por profissional: todas são `@@unique` no
   schema. Validar só na aplicação deixa brecha para duas requisições
   simultâneas passarem juntas.

5. **Dinheiro é `Decimal(12,2)`, nunca `Float`.**
   Em ponto flutuante `0.1 + 0.2` não fecha caixa. Na fronteira da API o
   Decimal vira `number` uma única vez, no serializador do módulo.

6. **Estilo vem de tokens.**
   Cores, espaçamento, tipografia, raios e sombras estão em
   `apps/web/src/styles/tokens.css`. Não introduza valores literais em
   CSS de módulo. A paleta é preto + dourado e os papéis são fixos:
   grafite (`--mh-ink`) carrega ação primária e texto, dourado
   (`--mh-gold`) é acento, vermelho (`--danger`) é só alerta real. Sobre
   dourado o texto é **preto** — branco não atinge contraste.

7. **Reatividade dos dados no aplicativo.**
   Consultas em componentes usam `useMemo` com `dataVersion` (de
   `useAuthenticated`) nas dependências.

8. **Duas fontes de dados durante a migração.**
   `VITE_DATA_SOURCE=mock` usa o banco de demonstração em memória;
   `api` fala com a API real. Os módulos migram um a um: cada service em
   `apps/web/src/services` troca os repositories pelas funções de
   `src/api/endpoints.ts`. Enquanto isso, a demonstração continua
   funcionando sem servidor.

## Papéis e rotas

| Papel | Home | Prefixo |
|---|---|---|
| morador | `/app` | `/app/*` |
| portaria | `/portaria` | `/portaria/*` |
| síndico / administrador | `/gestao` | `/gestao/*` |
| administradora | `/portfolio` | `/portfolio/*` |

Contas de demonstração: `morador@`, `portaria@`, `sindico@`, `admin@`,
`administradora@` `myhome.test` — senha `123456`. Fora do modo de
demonstração as contas nascem com troca de senha obrigatória.

## Segurança — decisões que não devem ser desfeitas

- Senha em Argon2id; a API nunca devolve o hash (usa `AuthenticatedUser`).
- Access token de 15 min em memória no cliente; refresh token em cookie
  `httpOnly`, com rotação a cada uso e hash no banco.
- Login com mensagem idêntica para e-mail inexistente e senha errada.
- `forbidNonWhitelisted`: campo desconhecido no corpo é erro, não algo a
  ignorar em silêncio.
- Em produção, erro inesperado devolve mensagem genérica — stack trace e
  texto do Postgres não saem para o cliente.

## Idioma

Interface, comentários e commits em **português (pt-BR)**.
