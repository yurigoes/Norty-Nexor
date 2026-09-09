# 04 — Perfis e permissões

Fonte de verdade: `packages/shared/src/permissions.ts`. Este documento
explica o desenho; o código é a especificação.

---

## 1. Por que sair do bitmask

No GLPI, `ProfileRight` guarda **um inteiro de bits por itemtype**.
`READ = 1`, `UPDATE = 2`, `CREATE = 4`, `DELETE = 8`, `PURGE = 16`, mais
bits específicos por classe. Um perfil é um conjunto de linhas
`(profiles_id, itemtype, rights)`.

Funciona e é compacto. Custa caro em duas horas:

- **Depuração.** "Por que o fulano não vê este chamado?" exige decompor
  um inteiro, cruzar com a árvore de entidades e com `is_recursive`.
- **Evolução.** Um bit novo é um número mágico a mais no código.

No Desk a permissão é uma string nomeada, o perfil é uma lista, e a
matriz é um objeto que web e API leem do mesmo lugar.

## 2. Os cinco perfis

| Perfil | Papel | Vê chamados |
|---|---|---|
| `SOLICITANTE` | Abre e acompanha os próprios | só os seus |
| `AGENTE` | Atende | os seus e os do seu time |
| `SUPERVISOR` | Distribui, acompanha SLA, aprova | todos da organização |
| `GESTOR` | Lê indicadores, não atende | todos, sem poder de escrita |
| `ADMINISTRADOR` | Configura tudo | todos |

`GESTOR` existe separado de `SUPERVISOR` de propósito: diretoria precisa
de painel e não deveria conseguir reatribuir chamado por engano.

## 3. Escopo de leitura

A granularidade que o GLPI acertou fica:

```
chamado:ler:proprios   requerente ou observador do chamado
chamado:ler:time       atribuído a um time do qual o usuário é membro
chamado:ler:todos      qualquer chamado da organização
```

`ticketReadScope(role)` devolve o escopo mais amplo do perfil, e o
repositório traduz em `where`:

```ts
// TODOS
{ organizationId }

// TIME
{ organizationId, OR: [
    { actors: { some: { role: 'ATRIBUIDO', teamId: { in: meusTimes } } } },
    { actors: { some: { userId: eu } } },
]}

// PROPRIOS
{ organizationId, actors: { some: {
    userId: eu, role: { in: ['REQUERENTE', 'OBSERVADOR'] },
}}}
```

**O escopo entra sempre**, mesmo quando a rota já foi autorizada.
Autorização diz se a rota abre; escopo diz quais linhas voltam. São
coisas diferentes e as duas são obrigatórias.

## 4. Como a permissão é aplicada

### Na API

```ts
@Post(':id/atribuir')
@RequirePermission('chamado:atribuir')
atribuir(@Param('id') id: string, @Body() dto: AtribuirDto) { ... }
```

O `PermissionsGuard` lê o `Membership` já resolvido pelo `JwtAuthGuard`,
consulta `can(role, permission)` e devolve 403 antes de o controller
rodar.

### No aplicativo

```tsx
const { can } = useAuthenticated();
{can('chamado:atribuir') && <BotaoAtribuir ticket={ticket} />}
```

O mesmo `can` do shared. Se o botão aparece e a API recusa, ou vice
e versa, é bug de matriz — e a matriz é uma só.

## 5. Chaves de aplicação

`ApiKey.scopes` guarda permissões nomeadas — o mesmo vocabulário. Uma
chave de intake típica leva:

```
['chamado:criar', 'chamado:ler:proprios', 'anexo:enviar']
```

A chave nunca recebe permissão de configuração. `ADMINISTRADOR` é perfil
de pessoa, não de integração.

## 6. Regras que a matriz não cobre

Três invariantes vivem no serviço de domínio, porque dependem do estado
do chamado e não do perfil:

1. **Chamado fechado não recebe evento.** Reabrir primeiro
   (`chamado:reabrir`), responder depois.
2. **Ninguém aprova a própria solicitação.** `Approval.approverId` não
   pode ser o requerente do chamado.
3. **Nota interna nunca sai por canal externo.** `visibility = INTERNA`
   impede a fila de saída de despachar o evento, independentemente de
   permissão. É a proteção contra o pior erro possível do produto:
   mandar comentário interno no WhatsApp do cliente.

## 7. Escopo por organização

Ortogonal ao perfil. Um usuário tem um `Membership` por organização, com
um perfil em cada — pode ser `AGENTE` na organização A e `SOLICITANTE`
na B. O token carrega a organização ativa; trocar de organização emite
token novo, não altera o atual.

Sem herança e sem recursividade: o que o usuário vê é a organização do
token, e nada além dela (`docs/02-gap-analysis.md`, item 7).
