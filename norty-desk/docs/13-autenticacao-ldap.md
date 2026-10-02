# 13 — Autenticação: usuário, e-mail e LDAP

Como o GLPI conversa com o LDAP, lido no código-fonte dele
(`glpi-project/glpi`, ramo `main`, `src/Auth.php` e `src/AuthLDAP.php`),
e como isso vira o desenho do Norty Desk.

> **Estado em 02/10/2026.** No ar: login por **e-mail** ou por **nome de
> usuário + empresa**, e-mail opcional, o **LDAP/AD por organização**
> (seção 2), os **grupos virando time e perfil** (seção 4) e as
> **réplicas** (seção 5).

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

## 4. Grupos virando time e perfil

É o `RuleRight` do GLPI, reduzido ao que o Desk tem: um grupo do AD vira
time, perfil, ou os dois. Lá a regra tem um motor de critérios genérico;
aqui a pergunta é sempre a mesma — "a pessoa está neste grupo?" —, e um
motor para uma pergunta só é esquema sem uso.

```
GET    /v1/auth-sources/:id/grupos           → [{ id, group, team, isTeamManager, role, position }]
POST   /v1/auth-sources/:id/grupos           → { group, teamId?, isTeamManager?, role?, position? }
PATCH  /v1/auth-sources/:id/grupos/:mapaId
DELETE /v1/auth-sources/:id/grupos/:mapaId
```

### Como os grupos são lidos

`groupSearch` é o `group_search_type` do GLPI:

| Valor | Como | Quando |
|---|---|---|
| `ATRIBUTO` | `memberOf` da própria pessoa | AD. Sai **de graça**: o atributo vem na mesma entrada que o login buscou |
| `OBJETO` | procura grupos cujo `member` é o DN da pessoa | OpenLDAP com `groupOfNames`, onde não existe `memberOf` |
| `AMBOS` | os dois, somados sem repetir | diretório misto |

A leitura acontece **depois do bind da pessoa**, e não antes: há
diretório que só mostra o `memberOf` a quem se autenticou.

`groupNested` segue grupo dentro de grupo, e é **só do Active
Directory**: usa `1.2.840.113556.1.4.1941`
(`LDAP_MATCHING_RULE_IN_CHAIN`), extensão da Microsoft. Num OpenLDAP a
busca volta vazia, por isso nasce desligada. Sem ela, quem está em
"TI-N2" não aparece em "TI" mesmo que o segundo contenha o primeiro —
`memberOf` do AD não é transitivo.

**Erro na leitura sobe e barra o login.** Confundir "o diretório caiu"
com "a pessoa não está em grupo nenhum" tiraria todo mundo dos times na
primeira instabilidade de rede.

### Como o grupo é reconhecido

O AD devolve o DN inteiro; quem cadastra o mapa quer escrever o nome. Os
dois lados têm regras **diferentes**, e a assimetria é o ponto
(`grupoCasa`, em `packages/shared`):

- Cadastrado como `TI-Suporte` → casa com o grupo em **qualquer** ramo.
- Cadastrado como `CN=TI-Suporte,OU=Matriz,…` → casa **só** com aquele.

Tratar os dois lados igual faria o DN cadastrado casar também pelo nome,
e aí escrever o ramo não distinguiria nada — que é a única razão de
alguém escrever o ramo.

### O que o mapa concede

Time e perfil são os dois opcionais: há mapa que só põe no time (o grupo
diz de que área a pessoa é) e mapa que só dá perfil (diz o que ela faz).
A pessoa entra em **todos** os times cujos mapas casam.

O perfil é um só, então **vence o primeiro mapa pela ordem** que tenha
perfil. A alternativa — "o perfil mais forte vence" — exigiria inventar
uma escada entre perfis que não se comparam: gestor decide aprovação do
lado do cliente, agente atende.

**Administrador e gestor não entram no mapa**, pela mesma razão do
provisionamento automático e de forma ainda mais direta: quem administra
o AD do cliente escreveria um grupo com o nome que quisesse e se poria
dentro dele. São 400 no DTO.

### Revogar, que é o que faz isto prestar

Conceder é a parte fácil. Sair do grupo no AD tem de tirar do time e
devolver o perfil, senão o mapa é uma catraca que só gira para um lado e
quem mudou de área continua vendo a fila da área antiga.

E revogar tem o risco oposto: apagar o que ninguém mandou apagar. A
saída é a mesma do inventário (`managedByAgent`): **o diretório só mexe
no que é dele.**

| Marca | O que garante |
|---|---|
| `team_members.managedByDirectory` | o diretório só tira do time quem ele pôs; quem foi atrelado pela tela fica, e não vira gerente por mapa |
| `memberships.roleFromDirectory` | o perfil volta ao `defaultRole` da fonte quando a pessoa sai do grupo, sem desfazer a promoção que um administrador deu à mão |

Duas consequências que valem saber:

- **Fonte sem mapa nenhum não mexe em nada.** É o estado de quem ainda
  não configurou, e tratá-lo como "nenhum grupo casou" rebaixaria a
  central inteira ao perfil padrão no primeiro login depois da
  atualização.
- **Apagar um mapa não desfaz o que ele concedeu na hora.** Quem o tirou
  pode ter tirado por engano, e varrer os times de todo mundo seria caro
  e irreversível. Cada pessoa perde aquilo no próprio login seguinte.

O mapa roda a cada login, como no GLPI — o AD é a fonte da verdade sobre
quem é de qual equipe, e uma sincronização que só rodasse no primeiro
acesso seria um retrato do dia em que a pessoa entrou. Falhar nele
**não** barra a entrada: quem já provou a senha no AD não fica de fora
porque um time foi apagado no meio do caminho.

O teste da fonte (`POST .../testar`) lista os grupos do login informado.
Montar o mapa sem saber como o diretório nomeia os grupos é adivinhar, e
adivinhar errado dá um mapa que nunca casa e ninguém sabe por quê.

## 5. Réplica: o mesmo diretório noutro servidor

É o `glpi_authldapreplicates`. Uma empresa com dois controladores de
domínio não deve perder o login porque um deles reiniciou para atualizar.

`auth_source_replicas` guarda **só endereço** — `host`, `port`,
`position`, `isActive`. Base, conta de serviço, filtros e campos
continuam na fonte, porque réplica é o mesmo diretório noutro servidor:
se os dados fossem outros, seria outra fonte. Repetir a configuração aqui
daria dois lugares para mudar o `baseDn`, e o esquecido viraria um login
que ora acha a pessoa, ora não.

```
GET    /v1/auth-sources/:id/replicas              → [{ id, host, port, position, isActive, lastUsedAt }]
POST   /v1/auth-sources/:id/replicas              → { host, port?, position?, isActive? }
PATCH  /v1/auth-sources/:id/replicas/:replicaId
DELETE /v1/auth-sources/:id/replicas/:replicaId
```

A lista de fontes (`GET /v1/auth-sources`) já traz as réplicas de cada
uma: a tela as mostra junto da ficha, sem outra volta.

### A troca acontece só na conexão

O login monta a fila `[servidor da fonte, ...réplicas ativas por
position]` e fica com **o primeiro que atender** (`conectarComoServico`,
o `tryToConnectToServer` do GLPI). Daí em diante é ele que responde a
busca e o bind da pessoa.

Isso é escolha, não limitação. Depois de conectado, o que o diretório
responde é **resposta**, não queda: senha errada é senha errada, e
procurar outra resposta noutra réplica seria tentar a mesma senha errada
em cada controlador da empresa. O mesmo vale para "não encontrei" — a
réplica tem a mesma base.

| O que acontece | Passa para a próxima? |
|---|---|
| Conexão recusada, timeout, StartTLS negado | sim |
| Conta de serviço recusada | **sim** — senha de serviço recém-trocada demora a replicar, e a réplica que ainda tem a antiga recusa enquanto a outra aceita. Custa pouco: credencial recusada volta rápido. |
| Login não encontrado, login ambíguo | não |
| Senha da pessoa errada | não |
| Queda no meio da busca | não — sobe como erro do diretório |

**Fonte sem conta de serviço tem um detalhe.** A conexão do `ldapts` é
preguiçosa: quem não faz bind nenhum "conecta" mesmo com o servidor
fora, e a queda só apareceria na busca, tarde demais para trocar de
servidor. Por isso, **quando há réplica cadastrada**, a fonte anônima faz
um bind anônimo para provar que o servidor está de pé — é o `ldap_bind`
sem credencial do GLPI. Com um servidor só esse bind não acontece: não há
escolha a fazer, e exigi-lo quebraria quem hoje busca sem ele.

### Quando nenhum atende

A mensagem traz o motivo de **cada servidor**:

```
Nenhum dos 3 servidores atendeu. dc01:389 — Sem conexão: ECONNREFUSED |
dc02:389 — O diretório recusou a conta de serviço. | dc03:389 — ...
```

"O diretório não respondeu" mandaria o administrador adivinhar qual; a
lista mostra na hora se foi um que caiu ou se os três recusaram a mesma
senha de serviço. Com um servidor só, a mensagem é a dele, sem prefixo:
dizer o endereço de quem falhou só informa quando havia escolha.

### Quem está carregando o login

`lastUsedAt` na réplica é a última vez que ela atendeu, e a tela mostra
isso ao lado do endereço. Coluna vazia é a notícia boa: o principal nunca
faltou. A gravação tem intervalo de um minuto — anotar a cada login seria
um `UPDATE` por autenticação durante toda a queda, e a tela não fica
melhor por saber o segundo exato.

O teste da fonte diz o mesmo em palavras: quando foi a réplica que
atendeu, a mensagem começa por *"Quem atendeu foi a réplica dc02:389 — o
servidor principal não respondeu"*. Teste verde sem essa linha esconderia
a melhor informação que ele tem para dar.

### O que a tela recusa

- **O endereço do próprio servidor principal.** Tentar duas vezes o mesmo
  servidor quando ele cai é espera dobrada, sem uma chance a mais.
- **O mesmo `host:port` duas vezes na fonte** (`@@unique`), pelo mesmo
  motivo.

Réplica é apagada de verdade, ao contrário da fonte. Ninguém aponta para
ela — é endereço de reserva, não origem de conta.

## O que ainda não tem

- **Login por UPN** (`nome@empresa.local`): o `@` manda para a busca por
  e-mail. Use o `sAMAccountName`.
- **Tempo de resposta**: o caminho do diretório demora o que o AD demora, e
  o local o que o argon2 demora; dá para distinguir pelo relógio se um login
  existe como conta local. O GLPI tem o mesmo comportamento.
