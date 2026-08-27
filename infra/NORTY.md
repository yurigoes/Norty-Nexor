# Deploy na infraestrutura Norty

O my Home roda no **CT 105 Asgard** (`norty-apps-fase3`, `192.168.15.75`),
ao lado do CRM/PRM, do Vision e do RH — os outros produtos `norty.com.br`.

| | |
|---|---|
| Código no host thor | `/srv/apps-fase3/my-home` |
| Dentro do CT | `/opt/fase3/my-home` (bind-mount) |
| Porta interna do web | `3060` |
| Porta interna da API | `3061` |
| Banco, Redis | CT 102 Yggdrasil — `192.168.15.72` |
| Domínios públicos | `myhome.norty.com.br` · `api-myhome.norty.com.br` |
| Borda | Cloudflare Tunnel |

## O que este stack **não** sobe

Três serviços que um deploy genérico traria e que aqui seriam erro:

- **Postgres e Redis.** Vão para o CT 102, como manda a regra de ouro.
  Cada app com o próprio banco significaria N backups, N versões e N
  lugares para procurar quando um dado sumisse.
- **Caddy, Let's Encrypt, portas 80/443.** O Cloudflare Tunnel termina o
  TLS e alcança as portas internas direto. Não há certificado para
  renovar nem porta para abrir no roteador.

---

## Primeiro deploy

### 1. Colocar o código no host

```bash
ssh -i ~/.ssh/norty_cluster_ed25519 root@100.91.185.42

mkdir -p /srv/apps-fase3
cd /srv/apps-fase3
git clone <URL-DO-REPOSITORIO> my-home
cd my-home

cp infra/.env.example infra/.env
```

O `.env` já vem apontando para `192.168.15.72` e para as portas 3060/3061.
Deixe `POSTGRES_PASSWORD` e `JWT_SECRET` vazios — o bootstrap gera.

### 2. Diagnosticar

```bash
./scripts/preflight.sh
```

Rodando no host, ele inspeciona o CT 105 por `pct exec`: confere o
bind-mount, o Docker, o disco, se o Postgres e o Redis do CT 102 estão
alcançáveis **de dentro do CT 105**, se as portas 3060/3061 estão livres
e se os domínios já resolvem.

### 3. Subir

```bash
./scripts/bootstrap.sh --demo
```

O script detecta que está no host e executa tudo dentro do CT 105. Ele:

1. cria o papel `myhome` e o banco `myhome` no CT 102, se não existirem;
2. constrói as imagens e sobe `myhome-api` e `myhome-web`;
3. aplica as migrações do Prisma;
4. semeia o condomínio (com `--demo`, também os dados fictícios);
5. espera a API responder no `/v1/health`.

### 4. Rotas do Cloudflare Tunnel

No painel da Cloudflare, no túnel que já serve os outros apps, adicione
dois *public hostnames*:

| Hostname | Serviço |
|---|---|
| `myhome.norty.com.br` | `http://192.168.15.75:3060` |
| `api-myhome.norty.com.br` | `http://192.168.15.75:3061` |

A Cloudflare cria os registros DNS sozinha.

> **Atenção ao cookie.** O refresh token usa `Domain=.norty.com.br`, o que
> permite que `myhome` e `api-myhome` compartilhem a sessão. Se a
> Cloudflare estiver com *Rocket Loader* ou alguma regra que reescreva
> `Set-Cookie` nesses hostnames, a sessão cai a cada 15 minutos — o
> access token expira e o refresh não chega. Mantenha as duas rotas sem
> transformação de cookie.

---

## Atualizações

O fluxo é o mesmo dos outros apps: editar no host, reconstruir no CT.

```bash
ssh -i ~/.ssh/norty_cluster_ed25519 root@100.91.185.42
cd /srv/apps-fase3/my-home
git pull

pct exec 105 -- bash -lc 'cd /opt/fase3/my-home && \
  docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build'

# migrações novas, se houver
pct exec 105 -- bash -lc 'cd /opt/fase3/my-home && \
  docker compose -f infra/docker-compose.yml --env-file infra/.env exec -T api npx prisma migrate deploy'
```

Ou simplesmente `./scripts/bootstrap.sh`, que faz tudo isso e é seguro
repetir.

---

## Banco

O bootstrap cria papel e banco automaticamente quando roda no host. Para
fazer à mão, no CT 102:

```bash
pct exec 102 -- su - postgres -c "psql"
```

```sql
CREATE ROLE myhome LOGIN PASSWORD '<senha do infra/.env>';
CREATE DATABASE myhome OWNER myhome;
```

O Postgres do CT 102 precisa aceitar conexões do CT 105. Se o
`preflight.sh` acusar que a porta 5432 não é alcançável, confira no CT 102:

```bash
# postgresql.conf
listen_addresses = '*'

# pg_hba.conf — a faixa da LAN, não 0.0.0.0/0
host  all  all  192.168.15.0/24  scram-sha-256
```

### Backup

O banco entra no dump geral do CT 102, que o Proxmox Backup Server em
`loki` já recolhe. Para um dump avulso do my Home:

```bash
pct exec 102 -- su - postgres -c \
  "pg_dump -Fc myhome > /var/lib/postgresql/myhome-$(date +%F).dump"
```

---

## Operação

```bash
# logs
pct exec 105 -- bash -lc 'cd /opt/fase3/my-home && \
  docker compose -f infra/docker-compose.yml --env-file infra/.env logs -f --tail=100'

# estado
pct exec 105 -- docker ps --filter name=myhome

# saúde da API, de dentro da LAN
curl -s http://192.168.15.75:3061/v1/health

# shell na API
pct exec 105 -- docker exec -it myhome-api sh
```

## Conferir se está tudo certo

Depois do deploy, a suíte de ponta a ponta exercita autenticação,
isolamento entre condomínios, permissões por papel e os cinco fluxos
contra a API que acabou de subir:

```bash
API_URL=http://192.168.15.75:3061/v1 node apps/api/test/e2e.mjs
```

São 38 verificações. Ela é segura de repetir: usa data inédita para a
reserva e procura um profissional ainda não avaliado, porque a unicidade
de horário e a de avaliação por unidade são regras reais do banco.

---

## Contas iniciais

Com `--demo`, as cinco contas nascem com a senha `123456`:
`morador@`, `portaria@`, `sindico@`, `admin@` e `administradora@myhome.test`.

**Sem `--demo`, elas nascem com troca de senha obrigatória no primeiro
acesso** — que é o comportamento correto para produção. Antes de cadastrar
um condomínio real, troque também os e-mails de `@myhome.test` para os
endereços verdadeiros.
