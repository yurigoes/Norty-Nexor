# 11 — Infraestrutura e deploy

Escrito para a infra Norty documentada pelo time. **Confirme o container
pela tabela antes de qualquer mudança — não escaneie às cegas.**

---

## 1. Onde o Desk mora

| Item | Valor |
|---|---|
| Container | **CT 105 Asgard** (`norty-apps-fase3`), `192.168.15.75` |
| Código no host | `/srv/apps-fase3/norty-desk` |
| Caminho no container | `/opt/fase3/norty-desk` |
| Domínio | `desk.norty.com.br` |
| API | `api-desk.norty.com.br`, ou `/api/*` no mesmo domínio |

**Regra de ouro da Norty:** o código mora **no host thor** em `/srv/...`
e entra no container por bind-mount em `/opt/...`. Edite no host,
reconstrua dentro do container com Docker Compose.

### Portas

O CT 105 já usa 3000, 3011, 3013, 3025, 3030, 3031. O Desk fica em:

| Serviço | Porta interna |
|---|---|
| `desk-web` | **3060** |
| `desk-api` | **3061** |
| `desk-worker` | sem porta (filas e crons) |

> Confirmar com `pct exec 105 -- ss -ltnp` antes de subir. As portas
> foram escolhidas fora do que a documentação lista, mas a documentação
> pode estar defasada.

## 2. Dependências no CT 102 Yggdrasil (`192.168.15.72`)

O Desk **não sobe banco próprio**. Usa a infra compartilhada:

| Serviço | Endereço | Para quê |
|---|---|---|
| PostgreSQL | `192.168.15.72:5432` | banco `nortydesk` |
| Redis | `192.168.15.72:6379` | estado de conversa do WhatsApp, filas |
| MinIO | `192.168.15.72:9000` | anexos, bucket `norty-desk` |
| Evolution | `192.168.15.72:8080` | WhatsApp |
| Ollama | `192.168.15.72:11434` | transcrição de áudio (Fase 3) |

### Preparar o banco

```bash
ssh -i ~/.ssh/norty_cluster_ed25519 root@100.91.185.42   # thor via Tailscale

pct exec 102 -- psql -U postgres -c "CREATE USER nortydesk WITH PASSWORD 'TROQUE';"
pct exec 102 -- psql -U postgres -c "CREATE DATABASE nortydesk OWNER nortydesk;"
```

### Preparar o bucket

```bash
pct exec 102 -- mc mb local/norty-desk
pct exec 102 -- mc anonymous set none local/norty-desk   # nada público: URL é assinada
```

### Preparar a instância da Evolution

```bash
pct exec 102 -- curl -s -X POST http://localhost:8080/instance/create \
  -H "apikey: $EVOLUTION_API_KEY" -H 'Content-Type: application/json' \
  -d '{"instanceName":"norty-desk","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
```

O webhook aponta para
`https://api-desk.norty.com.br/v1/channels/whatsapp/inbound/<channelAccountId>`,
com o segredo HMAC gravado em `ChannelAccount.config.webhookSecret`.

## 3. Deploy

```bash
# 1) entrar no thor
ssh -i ~/.ssh/norty_cluster_ed25519 root@100.91.185.42

# 2) o código fica no HOST
cd /srv/apps-fase3/norty-desk
git pull

# 3) build e sobe DENTRO do container
pct exec 105 -- bash -c 'cd /opt/fase3/norty-desk && docker compose up -d --build'

# 4) migrações
pct exec 105 -- bash -c 'cd /opt/fase3/norty-desk && docker compose exec -T desk-api npm run db:migrate'
```

Primeira instalação, depois das migrações:

```bash
pct exec 105 -- bash -c 'cd /opt/fase3/norty-desk && docker compose exec -T desk-api npm run db:seed'
```

## 4. Roteamento

O Caddy do CT 105 já atende os domínios da fase 3. O bloco do Desk:

```caddyfile
desk.norty.com.br {
    encode gzip zstd

    handle /api/* {
        uri strip_prefix /api
        reverse_proxy desk-api:3061
    }

    handle {
        reverse_proxy desk-web:3060
    }
}

api-desk.norty.com.br {
    encode gzip zstd
    reverse_proxy desk-api:3061
}
```

Dois caminhos para a API de propósito: `api-desk.` é o endereço público
para integração e webhook; `/api/*` no mesmo domínio evita CORS no
aplicativo.

## 5. Variáveis de ambiente

Modelo em `apps/api/.env.example`. Os que precisam de atenção:

```bash
DATABASE_URL="postgresql://nortydesk:SENHA@192.168.15.72:5432/nortydesk?schema=public"
REDIS_URL=redis://192.168.15.72:6379
MINIO_ENDPOINT=192.168.15.72
EVOLUTION_BASE_URL=http://192.168.15.72:8080

# openssl rand -hex 48
JWT_SECRET=
# openssl rand -hex 32 — cifra os segredos de canal (AES-256-GCM)
CHANNEL_SECRET_KEY=
```

`CHANNEL_SECRET_KEY` é o que protege senha de IMAP e chave da Evolution
no banco. **Perder essa chave significa reconfigurar todos os canais.**
Guarde-a onde a Norty guarda o resto.

## 6. Segurança — decisões que não devem ser desfeitas

Herdadas do padrão Norty e válidas aqui:

- Senha em **Argon2id**; a API nunca devolve o hash.
- Access token de **15 min em memória** no cliente; refresh token em
  cookie `httpOnly`, com **rotação a cada uso** e hash no banco.
- Login com **mensagem idêntica** para e-mail inexistente e senha
  errada.
- `forbidNonWhitelisted`: campo desconhecido no corpo é erro, não algo a
  ignorar em silêncio.
- Em produção, erro inesperado devolve mensagem genérica — stack trace e
  texto do Postgres não saem para o cliente.

Específicas do Desk:

- **Webhook de entrada exige HMAC.** E-mail e WhatsApp. Assinatura
  conferida em tempo constante (`assinatura.ts`) — comparar com `===`
  vaza o prefixo correto.
- **Segredo de canal é cifrado** antes de entrar em
  `ChannelAccount.config`. Nunca em texto claro.
- **URL de anexo é assinada, com 15 min de validade.** O bucket não é
  público.
- **Nota interna não sai por canal externo.** Verificado na permissão
  *e de novo* na fila de saída. É o pior erro possível deste produto.

## 7. Observabilidade

- `GET /v1/health` — vivo.
- `GET /v1/health/ready` — Postgres, Redis, MinIO, Evolution. É o que o
  Caddy consulta antes de liberar tráfego.
- Fila de saída com falha visível em `GET /v1/channels/outbound?status=FALHOU`.
- Mensagens não processadas em `GET /v1/channels/inbound?processed=false`.

Estes dois últimos são a tela que o GLPI não tem: **quando um e-mail não
virou chamado, dá para ver por quê**.

## 8. Backup

- **Postgres:** entra no backup do CT 102, que já vai para o Proxmox
  Backup Server no **loki**.
- **MinIO:** bucket `norty-desk` no mesmo esquema.
- **Segredos:** `JWT_SECRET` e `CHANNEL_SECRET_KEY` fora do backup de
  aplicação, no cofre da Norty.

Restauração é banco + bucket + as duas chaves. Sem as chaves, os canais
precisam ser reconfigurados.

## 9. Se algo der errado

```bash
# logs
pct exec 105 -- bash -c 'cd /opt/fase3/norty-desk && docker compose logs -f --tail=200 desk-api'

# a API alcança o CT 102?
pct exec 105 -- bash -c 'cd /opt/fase3/norty-desk && docker compose exec -T desk-api node -e "require(\"net\").connect(5432,\"192.168.15.72\").on(\"connect\",()=>{console.log(\"postgres ok\");process.exit(0)}).on(\"error\",e=>{console.error(e.message);process.exit(1)})"'

# a instância do WhatsApp está pareada?
pct exec 102 -- curl -s http://localhost:8080/instance/connectionState/norty-desk -H "apikey: $EVOLUTION_API_KEY"

# voltar uma versão
pct exec 105 -- bash -c 'cd /opt/fase3/norty-desk && git checkout <tag anterior> && docker compose up -d --build'
```
