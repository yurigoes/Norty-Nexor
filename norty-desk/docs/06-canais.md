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
<Norty_Desk_Ticket_{ticketId}_{uuid}@desk.norty.com.br>
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

### 3.7 Limites conhecidos

- **Janela de 24 h do WhatsApp Business.** Se a Norty migrar para a API
  oficial da Meta, mensagem fora da janela exige *template* aprovado. Com
  a Evolution (que usa Baileys, não a API oficial), isso não se aplica —
  mas a conta corre risco de bloqueio se houver disparo em massa. **O
  Desk só responde a quem falou primeiro**, nunca prospecta.
- **Uma instância por organização.** Duas organizações não compartilham
  número; o `Contact` é único por `(organizationId, phone)`.

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
| Consultar status | ✓ | — | ✓ (`status`) | ✓ |
| Responder | ✓ | ✓ | ✓ | ✓ |
| Anexar arquivo | ✓ | ✓ | ✓ | ✓ |
| Baixar anexo | ✓ | ✓ | ✓ | ✓ |
| Fechar | ✓ | — | ✓ (`fechar`) | ✓ |
| Aprovar | ✓ | — | — | ✓ |

E-mail não consulta status porque não há como perguntar sem ambiguidade;
quem quer consultar por e-mail responde ao chamado e o agente responde.
