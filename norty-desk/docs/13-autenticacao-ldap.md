# 13 — Autenticação: usuário, e-mail e LDAP

Como o GLPI conversa com o LDAP, lido no código-fonte dele
(`glpi-project/glpi`, ramo `main`, `src/Auth.php` e `src/AuthLDAP.php`),
e como isso vira o desenho do Norty Desk.

> **Estado em 10/09/2026.** No ar: login por **e-mail** ou por **nome de
> usuário + empresa**, e-mail opcional, e o **LDAP/AD por organização**
> (seção 2). Falta: grupos do AD virando equipes e perfis, e réplicas.

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

### Decisões do Yuri (10/09/2026)

- Quem autentica no AD e ainda não existe é **criado na hora**, como no GLPI.
- Perfil padrão de quem entra pelo AD: **Solicitante**.
- **E-mail opcional** — conta de AD sem `mail` existe.
- **Nome de usuário único por organização** — dois clientes podem ter o seu
  `jsilva`. Por isso o login por usuário pede a empresa.

### O modelo

| Onde | O quê |
|---|---|
| `users.email` | Opcional; único quando preenchido. |
| `memberships.username` | O nome de usuário, **no vínculo** com a organização; único por organização. |
| `users.authSourceId`, `users.externalId` | Conta de diretório: a fonte que a criou e o valor do `syncField` (o `objectGUID`, em hex). Único por fonte. Nulo = conta local. |
| `auth_sources` | O `glpi_authldaps`, por organização: servidor, porta, StartTLS/LDAPS, base, conta de serviço (senha cifrada com `CHANNEL_SECRET_KEY`), campos de login/sync/e-mail/nome/telefone, filtro extra, tempo limite, ordem, criar-na-hora e perfil padrão. |

A migração `20260910180000_identidade_por_organizacao` move o `username`
de `users` para `memberships` antes de apagar a coluna — o diff do Prisma
apagava primeiro e o valor se perdia.

### O fluxo de login

```
login digitado (+ empresa, quando não tem "@")
  ├─ com "@" → procura por e-mail (global)
  └─ sem "@" → sem empresa: 400 "Informe a empresa"
               com empresa: procura o vínculo (username, empresa)
        │
        ├─ achou, conta local        → argon2.verify
        ├─ achou, conta de diretório → bind na fonte DELA, com o login do vínculo
        │                              (mesmo que tenha digitado o e-mail);
        │                              objectGUID diferente do guardado → recusa
        └─ não achou (usuário + empresa) → fontes ativas da empresa, pela ordem:
               conta de serviço → busca (loginField=escapado) & filtro
               1 resultado → bind com a senha digitada
                 ok    → vincula (mesmo objectGUID já conhecido) ou cria
                 senha → para ali: 401
               0 ou 2 → próxima fonte
```

- **Diretório fora do ar não é senha errada**: responde **503** "Não foi
  possível falar com o diretório (AD) da empresa", nunca "usuário ou senha
  inválidos" — senão uma queda do AD vira, para a empresa inteira, uma fila
  de reset de senha. Só é 503 se nenhuma fonte que respondeu conhecia a
  pessoa.
- **Senha vazia** é recusada antes de abrir conexão: bind com senha vazia é
  bind anônimo, e muitos servidores respondem sucesso.
- O login digitado entra no filtro **escapado** (RFC 4515), e os nomes de
  atributo configurados só aceitam letras, números e hífen — os dois são as
  portas de injeção de filtro.
- A cada login, **nome, e-mail e telefone** voltam a ser os do diretório.
  E-mail que já é de outra conta não é copiado.
- **Não se funde conta por coincidência**: se o login do AD já é de uma
  conta local da empresa, ou o e-mail do AD já é de outra conta, a conta de
  diretório não assume a existente. No primeiro caso o login é recusado
  (e fica no log `Login`); no segundo, a pessoa nasce sem e-mail.
- Conta de diretório não troca senha, e-mail nem usuário pelo Desk: vêm do
  AD. A senha guardada nela é aleatória e nunca abre a conta.
- O perfil de quem é criado na hora vai no máximo até **Supervisor**. Gestor
  e administrador só por um administrador, em Pessoas — quem administra o AD
  do cliente não vira administrador do Desk criando uma conta lá.

### A tela

**Configuração → Autenticação (AD)** (`/config/autenticacao`, permissão
`config:autenticacao`, que só o administrador tem). Botões que preenchem os
campos para **Active Directory** (`sAMAccountName`, `objectGUID`, só pessoas
e contas habilitadas) e **OpenLDAP** (`uid`, `entryUUID`,
`inetOrgPerson`). "Salvar e testar" confere conexão, conta de serviço e
base; com um login no campo de teste, procura a pessoa e mostra o que o
diretório devolve — sem a senha dela, que o administrador não tem.

API: `GET/POST /v1/auth-sources`, `PATCH/DELETE /v1/auth-sources/:id`
(desativar; as pessoas criadas pela fonte apontam para ela),
`POST /v1/auth-sources/:id/testar` `{ login? }`. A senha de serviço nunca
volta: a resposta traz `hasBindPassword`; na edição, ausente mantém, texto
troca, `null` apaga.

Biblioteca: **`ldapts` 8.2** (a 9 exige Node 22; a imagem é Node 20).

### O que ainda não tem

- **Grupos → equipes e perfis** (`group_*` do GLPI).
- **Réplicas**: um servidor por fonte. Com dois DCs, duas fontes na ordem.
- **Login por UPN** (`nome@empresa.local`): o `@` manda para a busca por
  e-mail. Use o `sAMAccountName`.
- **Tempo de resposta**: o caminho do diretório demora o que o AD demora, e
  o local o que o argon2 demora; dá para distinguir pelo relógio se um login
  existe como conta local. O GLPI tem o mesmo comportamento.
