# 06 — Canais: e-mail e WhatsApp

Um chamado nasce por quatro portas. Todas convergem para o mesmo caso de
uso de domínio. **O adaptador de canal traduz e sai — não tem regra de
negócio.**

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│   Web    │   │  E-mail  │   │ WhatsApp │   │   API    │
└────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │              │
     │         InboundMessage (idempotência)      │
     │              │              │              │
     └──────────────┴──────┬───────┴──────────────┘
                           ▼
                 ┌───────────────────┐
                 │  IntakeService    │  regras de entrada,
                 │                   │  categoria, SLA, atribuição
                 └─────────┬─────────┘
                           ▼
              AbrirChamado  ·  ResponderChamado  ·  AnexarArquivo
                           ▼
                  Ticket + TicketEvent
                           ▼
                 ┌───────────────────┐
                 │ OutboundMessage   │  responde pelo canal de origem
                 └───────────────────┘
```

---

## 1. A fronteira de idempotência

Nenhuma mensagem externa vira evento direto. Ela primeiro grava em
`InboundMessage`, com

```
@@unique([organizationId, channel, externalId])
```

Se o poll IMAP roda duas vezes, ou a Evolution reentrega um webhook (ela
reentrega), o segundo `INSERT` falha com violação de unicidade e o
processamento para ali, sem duplicar chamado.

**O GLPI não tem isso.** É a correção mais barata e mais valiosa do
coletor de e-mail.

O processamento é em duas fases:

1. **Receber** — grava `InboundMessage`, responde 200 ao remetente
   rápido. Se falhar aqui, o provedor reentrega.
2. **Processar** — job assíncrono lê as mensagens com `processedAt IS
   NULL`, resolve o chamado, cria o `TicketEvent`, preenche `eventId` e
   `processedAt`.

Falha no processamento não perde a mensagem: ela fica na fila com
`discardedReason` preenchido, visível na tela de canais.

---

## 2. E-mail

### 2.1 Entrada

Duas formas, configuradas em `ChannelAccount`:

| `kind` | Como entra |
|---|---|
| `EMAIL_IMAP` | poll a cada minuto (`ColetaEmailJob`) |
| `EMAIL_WEBHOOK` | `POST /v1/channels/email/inbound` |

Configuração IMAP (`ChannelAccount.config`, segredos cifrados):

```json
{
  "host": "imap.norty.com.br",
  "port": 993,
  "tls": true,
  "username": "suporte@norty.com.br",
  "password": "<cifrado>",
  "folder": "INBOX",
  "processedFolder": "Processados",
  "maxAttachmentBytes": 26214400
}
```

### 2.2 Threading — mesmo algoritmo do GLPI

Reproduz `MailCollector::getItemFromHeaders()`, na mesma ordem:

1. **Descarta o eco.** Se o `Message-ID` da mensagem consta em
   `OutboundMessage.externalId` desta instalação, é a própria
   notificação voltando. Ignora. (No GLPI:
   `isItilNotificationFromSelf()`.)
2. **`In-Reply-To`.** Se referencia um `OutboundMessage` nosso, resolve
   o chamado por ele.
3. **`References`.** Idem, varrendo a lista da direita para a esquerda.
4. **Assunto.** Regex `/\[.*#(\d+)\]/` — o mesmo padrão do GLPI. O
   número é `Ticket.number` da organização do canal.
5. **Nada casou** → chamado novo.

O `Message-ID` que o Desk gera segue o formato do GLPI, para
compatibilidade com bases migradas:

```
<Norty_Desk_Ticket_{ticketId}_{uuid}@chamados.norty.com.br>
```

### 2.3 Do e-mail ao chamado

| Parte do e-mail | Vira |
|---|---|
| `From` | `Contact` (criado se não existir) → ator `REQUERENTE` |
| `Cc` | `Contact` → ator `OBSERVADOR` |
| `Subject` (sem `Re:`, `Fwd:`, `[#n]`) | `Ticket.subject` |
| corpo texto/HTML | `Ticket.description` ou `TicketEvent.body` |
| anexos | `Attachment` no MinIO |
| `Message-ID` | `InboundMessage.externalId` |

O corpo é limpo antes de virar evento (equivalente a `cleanContent()`):

- HTML sanitizado com lista branca de tags.
- Citação da mensagem anterior removida (`> `, `-----Original`,
  `Em ... escreveu:`, `<blockquote type="cite">`).
- Assinatura cortada no separador `-- `.
- Rodapé corporativo removido por padrão configurável na organização
  (equivalente a `BlacklistedMailContent`).

**O original nunca se perde**: `InboundMessage.bodyHtml` e `rawHeaders`
guardam a mensagem íntegra, e a tela do evento tem "ver original".

### 2.4 Saída

`OutboundMessage` com `channel = EMAIL`. Regras:

- `visibility = INTERNA` **nunca** sai. Verificação na fila de saída,
  não só na permissão.
- Assunto sempre `[Norty Desk #{number}] {subject}` — é o que sustenta o
  threading da resposta.
- `In-Reply-To` aponta para o último `externalId` do chamado.
- Remetente é `Team.email` do time atribuído, ou o do canal.

### 2.5 O que melhora em relação ao GLPI

| | GLPI | Desk |
|---|---|---|
| Duplicação sob concorrência | possível | impedida por `@@unique` |
| Entrada | só poll IMAP | poll **ou** webhook |
| Mensagem original | descartada após limpeza | guardada em `InboundMessage` |
| Falha de coleta | log do cron | fila visível com motivo |
| Anexo | disco do servidor | MinIO com URL assinada |

---

## 3. WhatsApp (Evolution API)

Não existe no GLPI. É a maior adição do Desk.

A infra da Norty já roda Evolution no CT 102 Yggdrasil
(`192.168.15.72:8080`).

### 3.1 Configuração

`ChannelAccount` com `kind = WHATSAPP_EVOLUTION`:

```json
{
  "baseUrl": "http://192.168.15.72:8080",
  "instance": "norty-desk",
  "apiKey": "<cifrado>",
  "webhookSecret": "<cifrado>",
  "maxAttachmentBytes": 16777216,
  "menuAtivo": true
}
```

### 3.2 Entrada — webhook

A Evolution chama:

```
POST /v1/channels/whatsapp/inbound/:channelAccountId
X-Evolution-Signature: <HMAC-SHA256 do corpo>
```

Eventos consumidos: `messages.upsert` (mensagem recebida) e
`messages.update` (confirmação de entrega). Corpo típico:

```json
{
  "event": "messages.upsert",
  "instance": "norty-desk",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C767D..."
    },
    "pushName": "Fulano da Silva",
    "message": { "conversation": "minha impressora parou" },
    "messageType": "conversation",
    "messageTimestamp": 1757400000
  }
}
```

Passos do adaptador:

1. Confere o HMAC. Assinatura inválida → 401, nada é gravado.
2. `data.key.fromMe = true` → é o eco da nossa própria resposta. Ignora.
3. Grava `InboundMessage` com `externalId = data.key.id`. Duplicata →
   200 e para.
4. Normaliza o telefone: `5511999999999@s.whatsapp.net` → `+5511999999999`.
5. Resolve ou cria o `Contact` da organização por telefone
   (`pushName` vira o nome quando não há cadastro).
6. Resolve a conversa (seção 3.3).
7. Enfileira para processamento.

### 3.3 Threading — o WhatsApp não tem assunto

E-mail tem `In-Reply-To`. WhatsApp não. A regra é **janela de conversa**:

```
chamadoAberto = último chamado do contato, nesta organização,
                com status != FECHADO
                e último evento há menos de 24 h

se existe        → a mensagem é resposta nesse chamado
senão            → mensagem inicia uma nova conversa
```

A janela de 24 horas é configurável por organização. Ela existe porque é
como as pessoas usam WhatsApp: mandar "obrigado" no dia seguinte é
resposta; mandar um problema novo três semanas depois não é.

**Quando o contato tem mais de um chamado aberto**, o bot pergunta:

```
Você tem 2 chamados abertos. Sobre qual você quer falar?

1️⃣  #1042 — Impressora do 3º andar
2️⃣  #1051 — Acesso ao sistema de ponto

Responda com o número, ou digite *novo* para abrir outro chamado.
```

A escolha é guardada como estado de conversa (Redis do CT 102, TTL de
1 hora) e a mensagem seguinte já cai no chamado escolhido.

### 3.4 Menu de comandos

Comandos reconhecidos em qualquer momento, quando `menuAtivo`:

| Comando | Efeito |
|---|---|
| `novo` | abre um chamado, mesmo com conversa em andamento |
| `status` | lista os chamados abertos do contato, com SLA |
| `status 1042` | detalha o chamado #1042 |
| `fechar 1042` | fecha, se o contato for o requerente |
| `menu` ou `ajuda` | mostra os comandos |
| `atendente` | marca o chamado como pedido de humano e notifica o time |

Fora dos comandos, o texto é conteúdo de chamado. **O bot não tenta
interpretar linguagem natural** — comando explícito é previsível, e
previsível é o que faz o cliente confiar no canal.

### 3.5 Mídia — abrir e anexar arquivo por WhatsApp

`messageType` ∈ `imageMessage`, `documentMessage`, `audioMessage`,
`videoMessage`. O binário não vem no webhook; busca-se na Evolution:

```
POST {baseUrl}/chat/getBase64FromMediaMessage/{instance}
apikey: <apiKey>

{ "message": { "key": { "id": "<data.key.id>" } }, "convertToMp4": false }
```

Resposta traz `base64`, `mimetype` e `fileName`. O adaptador:

1. Decodifica, confere `sizeBytes <= maxAttachmentBytes`.
2. Calcula SHA-256 → `Attachment.checksum`.
3. Envia ao MinIO (`192.168.15.72:9000`), bucket `norty-desk`, chave
   `{organizationId}/{ticketId}/{uuid}-{filename}`.
4. Cria `TicketEvent` do tipo `ANEXO` com `channel = WHATSAPP`, e o
   `Attachment` ligado a ele.
5. A legenda da mídia (`caption`), quando existe, vira o `body` do
   evento.

**Áudio** é anexado como arquivo. Transcrição é possível pelo Ollama do
CT 102 (`192.168.15.72:11434`) e fica para a Fase 3 — não é premissa.

### 3.6 Saída

```
POST {baseUrl}/message/sendText/{instance}
apikey: <apiKey>

{ "number": "5511999999999", "text": "..." }
```

Para arquivo:

```
POST {baseUrl}/message/sendMedia/{instance}

{ "number": "5511999999999", "mediatype": "document",
  "fileName": "orcamento.pdf", "media": "<base64 ou URL assinada>",
  "caption": "Segue o orçamento" }
```

Regras de saída:

- `visibility = INTERNA` **nunca** sai. Mesma verificação do e-mail, no
  mesmo ponto da fila.
- Toda mensagem começa com `[#{number}]` para o cliente saber de qual
  chamado se trata.
- Retentativa com backoff exponencial (1 min, 5 min, 15 min, 1 h) e
  no máximo 4 tentativas; depois disso, `FALHOU` e alerta no painel de
  canais.
- Se a Evolution devolver "número não existe no WhatsApp", o canal do
  chamado cai para e-mail quando houver e-mail no contato.

### 3.6.1 Áudio vira texto

O áudio recebido pelo WhatsApp é transcrito antes de qualquer decisão
sobre a mensagem: sem isso ele não entra na regra de entrada, não vira
assunto do chamado, e o agente precisa ouvir quarenta segundos para
saber do que se trata. O áudio original continua anexado.

O modelo roda no **Ollama do CT 102** (`docs/11-infra.md`): áudio de
cliente não sai para serviço de terceiro.

O texto entra marcado como transcrição, e não como se a pessoa o
tivesse digitado — quem lê precisa saber que aquilo saiu de um modelo e
pode estar errado. Nome próprio e número são justamente o que a
transcrição erra.

**Falhar é silencioso, e é o comportamento certo.** Ollama fora do ar,
modelo não baixado, áudio grande demais, `OLLAMA_BASE_URL` em branco: em
todos os casos a mensagem vira chamado com o áudio anexado, exatamente
como antes de existir transcrição. O cliente já mandou o áudio e está
esperando atendimento, não uma mensagem de erro sobre um recurso
interno.

### 3.7 Limites conhecidos

- **Janela de 24 h do WhatsApp Business.** Com a Evolution (que usa
  Baileys, não a API oficial) isso não se aplica — mas a conta corre
  risco de bloqueio se houver disparo em massa. **O Desk só responde a
  quem falou primeiro**, nunca prospecta.
  *Atualizado:* a API oficial da Meta existe agora, e ali a janela é
  regra da plataforma. Ver a seção 3A.
- **Uma instância por organização.** Duas organizações não compartilham
  número; o `Contact` é único por `(organizationId, phone)`.

---

## 3A. WhatsApp pela API oficial da Meta

*(acrescentado depois — convive com a Evolution durante a migração)*

### 3A.1 Por que as duas existem lado a lado

| | Evolution (Baileys) | Meta (Cloud API) |
|---|---|---|
| Como fala | fingindo ser um celular pareado | pela porta da frente |
| Janela de 24 h | não existe | **existe**, e é a regra |
| Template aprovado | não precisa | necessário fora da janela |
| Lista de toque | não desenha | desenha |
| Risco da conta | **bloqueio sem aviso** | nenhum |
| Custo | zero | por conversa |

A migração de um número real não acontece num sábado. Durante ela as
duas contas precisam existir, e mensagens de chamados diferentes saem
por caminhos diferentes. Por isso quem decide o transporte é a **conta
de canal ativa da organização**, e não uma variável de ambiente — que
era como estava e amarrava a instalação inteira a um provedor.

Com as duas ativas, a Meta ganha. A resposta a uma mensagem que entrou
por uma conta específica sai **pela mesma**: responder por outro número
é, para quem recebe, mensagem de um desconhecido.

### 3A.2 Configurar: quatro campos e uma URL

Em **Configurações → Canais → WhatsApp (oficial, Meta)**:

| Campo | Onde achar no painel da Meta |
|---|---|
| Id do número | WhatsApp → Configuração da API (é um número longo, não o telefone) |
| Token permanente | usuário de sistema — o token de 24 h só serve para testar |
| Chave secreta do aplicativo | Configurações do aplicativo → Básico |
| Token de verificação | você inventa, e repete a mesma palavra lá |

E a URL, que vai no sentido contrário — daqui para o painel:

```
https://chamados.norty.com.br/api/v1/channels/meta/inbound/<id-da-conta>
```

Ao salvá-la, a Meta chama uma vez com um desafio e espera o desafio de
volta **em texto puro**. Devolver JSON reprova a configuração com uma
mensagem que não explica nada.

### 3A.3 A assinatura é sobre os bytes

A Meta assina o corpo exato que mandou (`X-Hub-Signature-256`).
Reserializar o JSON já parseado dá outros bytes — a ordem das chaves e o
escape de acento mudam — e a assinatura de **toda** entrega legítima
falharia. Por isso a aplicação sobe com `rawBody: true` e a conferência
é sobre `request.rawBody`.

O canal da Evolution reserializa, e funciona porque quem assina lá somos
nós mesmos. Aqui quem assina é outra empresa.

Sem `appSecret` configurado, o canal **recusa tudo**. Esta URL é
pública: aceitar sem conferir deixaria qualquer um abrir chamado em nome
de qualquer telefone.

### 3A.4 A janela de 24 horas

Texto livre só passa dentro de 24 h da última mensagem **da pessoa**.
Fora disso, só template aprovado.

O Desk decide isso **antes de tentar**. Mandar e deixar a Meta recusar
custaria quatro tentativas com backoff — nenhuma passaria, porque o que
falta não é rede, é permissão — e deixaria `131047` no diagnóstico, que
não conta nada a quem for investigar. A fila registra a frase em
português, e é ela que a tela mostra.

A última entrada sai do `max(receivedAt)` de `InboundMessage` para
aquele telefone naquela conta. O fato já está gravado; uma coluna à
parte com a mesma verdade seria um segundo lugar para ela ficar errada.

Há cinco minutos de folga antes do fim: o relógio da Meta não é o nosso,
e mandar aos 23 h 59 min 58 s é apostar que os dois concordam ao segundo.

### 3A.5 O menu vira lista de toque

Na Evolution a pessoa **digita** `status` — e quem digita erra:
"Status", "status?", "ver status". Na Meta ela toca, e a resposta volta
com o `id` exato da linha que tocamos escolher.

É isso que faz o fluxo de empresa funcionar sem estado: a Meta devolve
`empresa:<clientId>`, e a escolha vem identificada. O único estado que o
bot guarda é entre a escolha da empresa e a mensagem seguinte —
`WhatsappConversa`, uma linha por pessoa por conta, com prazo de 12 h.
Estado de conversa que não expira vira um bot que continua achando que a
pergunta de terça-feira está no ar.

Toda lista sai **também** em texto, e o texto é a mesma coisa, não um
resumo: é o que a Evolution manda, e é o que fica legível no banco e no
diagnóstico.

### 3A.6 Quem é a pessoa, e de qual empresa é o chamado

Quem escreve pelo WhatsApp não digita login. O número é o que há, e dele
saem o nome e a empresa — o chamado nasce identificado, com contrato e
SLA certos, sem ninguém perguntar nada.

O caso que obriga a perguntar é real: **o mesmo número em mais de uma
empresa da carteira**. Acontece com quem presta serviço para duas, com o
dono que tem duas razões sociais, e com o celular que passou de uma
pessoa para outra. No banco isso é mais de um `User` com o mesmo
`phone`, cada um no seu `Client` — o vínculo é único por `(userId,
organizationId)`, então a mesma pessoa em duas empresas é, para o
modelo, duas pessoas.

```
mensagem → quantas empresas tem este número?
             ├─ nenhuma → chamado abre como contato de fora (como sempre foi)
             ├─ uma     → chamado no nome dela, na empresa dela
             └─ várias  → lista de toque com as empresas
                             ↓ toque
                          "Certo, <Empresa>. Me conte o que aconteceu."
                             ↓ próxima mensagem
                          chamado na empresa escolhida
```

Adivinhar pela primeira erraria em silêncio, e o erro só apareceria no
relatório do mês, com o chamado cobrado da empresa errada.

O id da empresa chega **de fora**, no toque. Ele é conferido contra a
organização e contra o vínculo deste número antes de valer: sem essa
cerca, um id trocado abriria chamado na empresa de outro cliente.

Quem está na Evolution responde o nome da empresa escrito, e o casamento
é sem acento e sem caixa, aceitando o começo do nome — mas **só quando
uma** empresa casa. "São" batendo em duas vira escolha errada com cara
de escolha certa.

### 3A.7 Cumprimento não é chamado

"Bom dia" virava um chamado com assunto "Bom dia", que alguém tinha de
abrir para descobrir do que se tratava. Agora vira o menu.

"Bom dia, a impressora parou" **não** é cumprimento: é um problema, e
tratá-lo como saudação faria a pessoa contar tudo de novo. A regra é o
texto ser só a saudação, com pontuação e emoji descontados.

### 3A.8 Mídia nos dois sentidos

Os dois provedores mandam só uma referência no webhook; o arquivo vem
num segundo pedido. Na Meta o `media_id` vira uma URL assinada, e **essa
URL também exige o token** — o que surpreende quem esperava um link
público e devolve 401 numa URL que parece aberta.

Na saída, mídia vai por `media_id` e nunca por `link`: o `link` faria a
Meta buscar a URL num servidor nosso, o que exige o arquivo público na
internet. Anexo de chamado não fica público, nem por cinco minutos.

Foto e áudio não têm nome de arquivo — só documento tem. O Desk inventa
um legível (`audio-whatsapp-3f2a1b9c.ogg`): sem isso o anexo se chamaria
pelo id da Meta, que não conta nada, e o navegador não saberia o que
fazer ao baixar.

### 3A.9 Um defeito antigo que apareceu aqui

O processamento lia `channelAccount.config` **sem decifrar**. Os
segredos são cifrados na gravação, então a chave que ia para a Evolution
era o texto cifrado `v1:...`.

O efeito era invisível: a Evolution recusava a busca de mídia com uma
chave que não existe, o `catch` devolvia `null`, e o chamado abria sem o
anexo. Ninguém via erro — só faltava o arquivo, e quem atendia culpava o
cliente por não ter mandado.

---

## 4. API pública de entrada

Para sistemas da Norty abrirem chamado sem usuário humano.

```
POST /v1/intake/tickets
Authorization: Bearer <ApiKey>
```

A chave carrega escopos nomeados (`docs/04-rbac.md`, seção 5) e resolve
a organização. Contrato em `docs/07-api.md`.

---

## 5. O que cada canal consegue fazer

| Ação | Web | E-mail | WhatsApp | API |
|---|:--:|:--:|:--:|:--:|
| Abrir chamado | ✓ | ✓ | ✓ | ✓ |
| Consultar status | ✓ | — | ✓ (`status` ou toque) | ✓ |
| Responder | ✓ | ✓ | ✓ | ✓ |
| Anexar arquivo | ✓ | ✓ | ✓ | ✓ |
| Baixar anexo | ✓ | ✓ | ✓ | ✓ |
| Fechar | ✓ | — | ✓ (`fechar`) | ✓ |
| Aprovar | ✓ | — | — | ✓ |

E-mail não consulta status porque não há como perguntar sem ambiguidade;
quem quer consultar por e-mail responde ao chamado e o agente responde.
