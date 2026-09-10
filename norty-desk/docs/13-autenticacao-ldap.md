# 13 — Autenticação: usuário, e-mail e LDAP

Como o GLPI conversa com o LDAP, lido no código-fonte dele
(`glpi-project/glpi`, ramo `main`, `src/Auth.php` e `src/AuthLDAP.php`),
e como isso vira o desenho do Norty Desk.

> **Estado em 10/09/2026.** Já no ar: login por **e-mail ou nome de
> usuário**, no mesmo campo (`User.username`, opcional e único). LDAP e
> e-mail opcional ainda **não** — são o próximo passo, e este documento é
> o ponto de partida.

---

## 1. Como o GLPI faz

### Uma fonte de autenticação por servidor

Cada diretório é um registro em `glpi_authldaps`. Os campos que o código
mais usa, e o que cada um decide:

| Campo | Para quê |
|---|---|
| `host`, `port` | Onde conectar. `ldaps://` no host já é TLS. |
| `use_tls`, `tls_version`, `tls_certfile`, `tls_keyfile` | StartTLS e certificado de cliente. |
| `rootdn`, `rootdn_passwd`, `use_bind` | A **conta de serviço** que faz as buscas. A senha fica cifrada com a chave do GLPI. Sem `use_bind`, o bind é anônimo. |
| `basedn` | Onde procurar pessoas. |
| `login_field` | O atributo que a pessoa digita na tela: `samaccountname` no AD, `uid` no OpenLDAP. |
| `sync_field` | Um identificador que **não muda** (ex.: `objectguid`). Sobrevive a renomeação de login. |
| `condition` | Filtro extra, combinado com o login. Ex.: só contas habilitadas, ou só um grupo. |
| `deref_option`, `timeout`, `pagesize` | Opções de busca e de rede. |
| `email1_field`, `realname_field`, `firstname_field`, `phone_field`, `title_field`, `responsible_field`, `picture_field` | De qual atributo vem cada dado do usuário. |
| `group_search_type`, `group_field`, `group_condition`, `group_member_field`, `use_dn` | Como descobrir os grupos: pelo atributo do usuário (`memberOf`), procurando objetos de grupo, ou os dois. |
| `is_active`, `is_default` | Liga/desliga; qual servidor a tela oferece primeiro. |

Réplicas (`glpi_authldapreplicates`) são outros `host:port` do mesmo
diretório. A conexão tenta o principal e, se falhar, as réplicas em ordem
(`AuthLDAP::tryToConnectToServer`).

### A conexão (`AuthLDAP::connectToServer`)

1. `ldap_connect(uri)`.
2. Opções: `LDAP_OPT_PROTOCOL_VERSION = 3`, `LDAP_OPT_REFERRALS = 0`,
   `LDAP_OPT_DEREF`, e `LDAP_OPT_NETWORK_TIMEOUT` quando há timeout.
3. `ldap_start_tls` se `use_tls` e o esquema não for `ldaps://`.
4. Bind com a conta de serviço (`rootdn`), ou anônimo.

### O login (`Auth::connection_ldap` + `AuthLDAP::searchUserDn`)

1. Conecta com a **conta de serviço**.
2. Procura a pessoa: filtro `(<login_field>=<login escapado>)`, combinado
   com `condition` num `(& ... )`, a partir de `basedn`. O login passa por
   `ldap_escape(..., LDAP_ESCAPE_FILTER)` — sem isso, `*` ou `)` no campo
   de login viram injeção de filtro. Se o `login_field` é um GUID, o valor
   é convertido para hexadecimal.
3. Exige **exatamente um** resultado. Zero ou dois é "usuário ou senha
   incorretos".
4. Faz `ldap_bind(DN da pessoa, senha digitada)`. **É esse bind que valida
   a senha** — o GLPI nunca lê nem guarda a senha do diretório.
5. Separa os erros: `errno 32` (*no such object*) é "não achou"; qualquer
   outro errno é "não consegui falar com o diretório".

### Como ele escolhe a fonte (`Auth::validateLogin`)

- A tela pode mandar a fonte escolhida: `local`, `ldap-<id>`, `mail-<id>`.
- Se a pessoa já existe e está marcada como LDAP (`authtype` + `auths_id`),
  usa **aquele** servidor. Senão, tenta todos os servidores ativos.
- Quem autentica no LDAP e ainda não existe no GLPI é **criado na hora** a
  partir dos atributos mapeados (a menos que o provisionamento automático
  esteja desligado). A cada login os dados são sincronizados.
- O login no GLPI é o `name` do usuário — **o e-mail é opcional**. É por
  isso que lá se entra com `usuario` e senha.

---

## 2. Como fica no Norty Desk

### O que já está feito

- `User.username` (opcional, único, minúsculas, 3–64 caracteres, sem `@`).
- A tela de login tem um campo só, "E-mail ou usuário". A API decide pelo
  `@`: com `@` procura por e-mail, sem `@` por usuário. A mensagem de erro
  é a mesma para login inexistente e senha errada, e os dois caminhos pagam
  o custo de um `argon2.verify`.
- `POST /v1/users` e `PATCH /v1/users/:id` aceitam `username` (conflito de
  unicidade responde 409; `null` na edição apaga).
- O corpo do login é `{ login, password }`. `{ email, password }` segue
  aceito, para clientes antigos.

### O que o LDAP pede do modelo

1. **`AuthSource` por organização** — o equivalente a `glpi_authldaps`,
   mas pendurado em `Organization`, porque o Desk é multiempresa: cada
   cliente traz o próprio AD. Mesmos campos da tabela da seção 1. A senha da
   conta de serviço vai cifrada, como as senhas de canal já são hoje
   (`CHANNEL_SECRET_KEY`).
2. **Usuário marcado com a origem**: `authSourceId` (nulo = conta local) e
   `externalId` (o valor do `sync_field`). O login de um usuário LDAP nunca
   compara senha local — vai sempre ao diretório.
3. **E-mail opcional**. Hoje `User.email` é obrigatório e único; conta de
   AD sem e-mail precisa existir. A migração torna o campo anulável e
   mantém a unicidade só quando preenchido. Chamados por e-mail continuam
   exigindo e-mail, é claro — só a conta não.
4. **Grupos → equipes e perfis**: mapeamento configurável de grupo do
   diretório para `Team` e para `Role` na organização.

### O fluxo de login, com LDAP

```
login digitado
  ├─ tem "@" → procura por e-mail
  └─ sem "@" → procura por username
        │
        ├─ achou e é conta local        → argon2.verify
        ├─ achou e é conta de diretório → bind no AuthSource dela
        └─ não achou → para cada AuthSource ativo da organização:
                         busca (login_field=...) & condition
                         1 resultado? bind com a senha
                         ok → cria o usuário (username = login_field,
                              externalId = sync_field, e-mail se houver)
```

A tela de login pode ganhar o seletor de fonte do GLPI, mas não precisa:
com o `username` único por instalação, a busca acima resolve sozinha.

### Decisões que ficam para o Yuri

- Provisionamento automático: quem autentica no AD vira usuário na hora, ou
  só quem um administrador já cadastrou?
- Perfil padrão de quem entra pelo LDAP (sugestão: `SOLICITANTE`).
- Se o `username` passa a ser único **por organização** (dois clientes com
  o mesmo `jsilva`) — aí o login precisa saber a organização antes, por
  subdomínio ou seletor.
- Biblioteca: `ldapts` (TypeScript, promessas, StartTLS, paginação) é a
  candidata natural para a API NestJS.
