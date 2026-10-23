# Norty Car — implantação, backup e recuperação

Stack de produção do **Norty Car | Sistema de Controle de Carros**. Segue as
mesmas convenções da infraestrutura Norty usadas pelo my Home
([../NORTY.md](../NORTY.md)): Postgres compartilhado no CT 102 e borda pelo
Cloudflare Tunnel.

| | |
|---|---|
| Aplicativo | `car.norty.com.br` → web (`WEB_PORT`, padrão 3070) |
| API | `api-car.norty.com.br` → api (`API_PORT`, padrão 3071) |
| Sites das locadoras | `<slug>.car.norty.com.br` → web |
| Domínios próprios | CNAME para `sites.car.norty.com.br` (ver abaixo) |
| Arquivos | volume Docker `nortycar_nortycar-storage` |

---

## 1. Banco

O isolamento entre empresas usa **Row-Level Security** com `FORCE`. Ele só
protege se o usuário com que a API conecta **não** for superusuário e **não**
tiver `BYPASSRLS`. No Postgres do CT 102:

```sql
CREATE ROLE nortycar LOGIN PASSWORD '<senha>' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE nortycar OWNER nortycar;
\c nortycar
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- usada pela regra anti-sobreposição de reservas
```

> `btree_gist` é extensão confiável (trusted) desde o PostgreSQL 13 e a própria
> migração tenta criá-la; criar como superusuário antes evita depender disso.

Confira depois do primeiro deploy:

```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'nortycar';  -- f | f
```

## 2. Primeiro deploy

```bash
cp infra/norty-car/.env.example infra/norty-car/.env
# preencha POSTGRES_PASSWORD e a conta inicial do Master (BOOTSTRAP_ADMIN_*)
./scripts/norty-car/bootstrap.sh
```

O script gera `JWT_SECRET` e `SECRETS_KEY`, constrói as imagens, aplica as
migrações **antes** de subir a versão nova, roda o seed (planos e conta do
Master com troca de senha obrigatória) e espera o `/v1/health`.

**Guarde `SECRETS_KEY` no cofre.** Ela cifra os segredos de MFA e de
integrações; perdê-la obriga a reconfigurar o MFA de todos e os segredos de
webhook.

No primeiro acesso ao Master: troque a senha, ative o MFA (obrigatório para a
equipe Norty em produção), defina os preços dos planos e cadastre a primeira
locadora.

## 3. Rotas do Cloudflare Tunnel

| Hostname | Serviço |
|---|---|
| `car.norty.com.br` | `http://<host>:3070` |
| `api-car.norty.com.br` | `http://<host>:3071` |
| `*.car.norty.com.br` | `http://<host>:3070` |

O mesmo bundle web serve o aplicativo e os sites: hosts listados em
`APP_HOSTS` abrem o aplicativo; qualquer outro host é tratado como site de
locadora, e a API só responde se o site estiver publicado e o domínio
pertencer àquela empresa.

## 4. Domínios próprios das locadoras

A locadora cadastra o domínio em **Administração → Domínios** e recebe:

- um registro **TXT** `_nortycar-verify.<domínio>` com o token (prova de posse);
- um **CNAME** apontando para `SITE_CNAME_TARGET`.

A verificação consulta o DNS de verdade. O certificado HTTPS tem dois caminhos:

**a) Cloudflare for SaaS (Custom Hostnames)** — se a zona Norty usar o
recurso, os domínios próprios entram como *custom hostnames* e o túnel
continua sendo a única borda.

**b) Caddy com TLS sob demanda** — em servidor com IP público e portas 80/443:

```bash
./scripts/norty-car/bootstrap.sh --custom-domains
```

O Caddy só emite certificado depois de perguntar à API
(`/v1/public/domains/tls-ask?domain=`) se o domínio está **ativo**. Sem essa
pergunta, qualquer pessoa poderia apontar um domínio para o servidor e gastar
a cota do Let's Encrypt.

## 5. Atualização

```bash
git pull
./scripts/norty-car/bootstrap.sh
```

Migrações são versionadas (`apps/car-api/prisma/migrations`) e aplicadas com
`prisma migrate deploy`, que nunca reescreve migração já aplicada. Mudança de
schema que remove ou renomeia coluna deve ser feita em duas versões
(expandir → migrar dados → contrair) para não derrubar a versão em execução.

## 6. Backup

```bash
./scripts/norty-car/backup.sh /srv/backups/nortycar
```

Gera o dump do banco (`pg_dump -Fc`) e um `.tar.gz` do volume de arquivos.
Rotina recomendada:

- diário, via cron no host, mantendo 14 cópias locais;
- cópia fora do servidor (MinIO/S3 do CT 102 ou outro provedor) logo após o
  backup — backup no mesmo disco não protege contra perda do disco;
- teste de restauração **mensal** num banco descartável.

## 7. Recuperação de desastre

1. Suba um Postgres e crie o papel/banco como na seção 1.
2. Restaure o banco:
   ```bash
   pg_restore -h <host> -U nortycar -d nortycar --no-owner --role=nortycar nortycar-<data>.dump
   ```
3. Restaure os arquivos no volume:
   ```bash
   docker volume create nortycar_nortycar-storage
   docker run --rm -v nortycar_nortycar-storage:/data -v "$PWD:/in" alpine \
     tar xzf /in/nortycar-storage-<data>.tar.gz -C /data
   ```
4. Restaure `infra/norty-car/.env` do cofre (principalmente `SECRETS_KEY`).
5. `./scripts/norty-car/bootstrap.sh` — as migrações já aplicadas são puladas.
6. Valide: `/v1/health`, login de um usuário de cada perfil e abertura de uma
   vistoria antiga com fotos.

Objetivos de referência: RPO de 24 h (backup diário) e RTO de 2 h. Para RPO
menor, habilite arquivamento contínuo de WAL no Postgres do CT 102.

## 8. Operação

```bash
docker compose -f infra/norty-car/docker-compose.yml --env-file infra/norty-car/.env logs -f api
docker compose -f infra/norty-car/docker-compose.yml --env-file infra/norty-car/.env ps
```

A saúde da plataforma (banco, armazenamento, filas de notificação e
webhooks com erro) aparece também no **Master → Saúde**.
