# 12 — Provisionar a NDesk (briefing para o agente local)

Este documento é para ser **entregue a um agente que roda na máquina do
Yuri**, com Tailscale, e que portanto alcança o thor — coisa que a
sessão em nuvem não faz. Ele descreve o que tem de acontecer, o que não
pode acontecer, e como saber que deu certo.

> **Estado em 10/09/2026: no ar.** CT 120 `NDesk`, IP fixo
> `192.168.15.82`. A rota de `chamados.norty.com.br` vive no túnel
> `norty-thor-yugo-family` (ID `8b2bb212-d4d5-426e-aaa8-6239c0356a7a`),
> cujo conector roda no CT 102, e aponta para `http://192.168.15.82:3060`.
> Base `nortydesk` no Postgres do CT 102. Tudo o que está abaixo foi
> exercitado nessa subida — inclusive os erros da última seção.

---

## O contexto, em cinco linhas

- O Norty Desk deste repositório roda na máquina `NDesk`, publicado em
  `https://chamados.norty.com.br` por túnel Cloudflare.
- `desk.norty.com.br` é **outra coisa**: uma aplicação Next.js num
  container `norty-desk` no heimdall, no ar desde agosto. Ela **fica de
  retaguarda e não se toca**.
- Não existe GLPI em máquina nenhuma da Norty. Se algum documento deste
  repositório disser o contrário, ele está desatualizado — veja a
  correção no topo de `docs/00-visao.md`.

## O que NÃO pode acontecer

1. **Não tocar no heimdall.** Nem no container `norty-desk`, nem no
   `norty-caddy`, nem no DNS de `desk.norty.com.br`. É a retaguarda em
   produção. O `cloudflared` do **host** thor é o túnel que publica o
   `desk.norty.com.br` — também não se toca.
2. **Não mexer nos containers que já existem no thor.** O script
   escolhe um id livre a partir do 120 e recusa se o nome já existir,
   mas a regra vale para qualquer comando manual: confirme o alvo pela
   tabela antes de agir, não escaneie às cegas. Ler log é permitido;
   reiniciar, editar ou criar algo lá é decisão do Yuri.
3. **Não colar o `TUNNEL_TOKEN` em conversa, log, captura de tela ou
   commit.** Ele é o segredo que substitui a senha do servidor: quem o
   tem publica no lugar da máquina. Se vazar, o remédio é revogar o
   túnel na Cloudflare e gerar outro. Ao ler processo ou log de
   conector, use `pgrep -l` (nunca `-a`) e filtre `grep -v eyJ`.
4. **Não subir o `desk-tunnel` com o token de um túnel compartilhado.**
   A NDesk viraria réplica dele: a Cloudflare reparte o tráfego entre
   todos os conectores, e pedidos dos outros sites cairiam numa máquina
   que não os serve.
5. **Não usar `--force`, não recriar máquina existente, não apagar
   volume.** Se algo já existe, pare e pergunte.

## Já decidido

**LXC** (`TIPO=lxc`, o padrão do script), pelo Yuri em 10/09/2026: o
parque inteiro do thor é LXC, inclusive os containers que já rodam
Docker. Não pergunte de novo, não proponha VM. Docker dentro de LXC
exige `nesting=1`; o script procura um container que já roda Docker e
copia dele `unprivileged`, `features`, o armazenamento do disco e a
rede. O caminho de VM (`TIPO=vm`) continua no script, sem uso.

**Túnel compartilhado, conector fora da NDesk**, pelo Yuri em
10/09/2026: a rota do `chamados` fica no `norty-thor-yugo-family`, junto
com app/api/vision.norty.com.br, sorva, pulso, licita e outros. Por isso
a NDesk não roda `cloudflared` (`COMPOSE_PROFILES` vazio) e o front
escuta na LAN (`DESK_BIND=0.0.0.0`). O modo de conector próprio segue
disponível — ver o topo do `infra/docker-compose.yml`.

**Banco**: base `nortydesk` no Postgres compartilhado do CT 102,
conectando como `postgres`, no mesmo padrão do Pulso. O role `nortydesk`
do exemplo **não existe** lá.

## O passo a passo

Os comandos `pct` rodam **no terminal do thor**. Se você já está logado
nele, rode sem `ssh` — `ssh root@thor` de dentro do próprio thor não
tem rota (`No route to host`).

### 1. Chegar no thor

```bash
ssh root@thor 'hostname && pveversion | head -1 && pct list'
```

### 2. Trazer o repositório para o thor

```bash
ssh root@thor 'cd /tmp && rm -rf norty-tmp && \
  git clone -q -b claude/brave-turing-b299vy \
  https://github.com/yurigoes/Norty-Nexor.git norty-tmp && echo ok'
```

### 3. Criar a máquina

```bash
ssh -t root@thor 'TIPO=lxc bash /tmp/norty-tmp/norty-desk/scripts/provisionar-ndesk.sh'
```

Ele mostra o que vai criar — id, armazenamento, IP fixo (o próximo
livre depois do maior IP do parque, conferido por ping) — e só cria
depois de um `SIM` digitado. Instala Docker, clona o repositório em
`/opt/norty-desk`, preenche o `WEB_ORIGIN` e testa se alcança o
Postgres do CT 102 (`192.168.15.72:5432`).

Qualquer escolha pode ser forçada por variável: `ARMAZEM`, `IP`
(`IP=dhcp` para DHCP, com aviso), `GW`, `DNS`, `DOMINIO`, `PRIV`,
`FEATURES`.

### 4. O banco

Numa instalação nova, crie a base (uma vez, no Postgres do CT 102 — é
escrita em infra compartilhada, então só com o aval do Yuri):

```sql
CREATE DATABASE nortydesk;
```

E aponte `/opt/norty-desk/apps/api/.env` para ela. Escreva **na
máquina**, nunca em conversa:

```bash
pct exec <ID> -- nano /opt/norty-desk/apps/api/.env
```

```
DATABASE_URL="postgresql://postgres:<senha>@192.168.15.72:5432/nortydesk?schema=public"
WEB_ORIGIN=https://chamados.norty.com.br
```

`WEB_ORIGIN` **tem** de bater com o domínio do túnel: é ele que assina o
cookie de sessão e monta o Message-ID do e-mail. Errado, o login não
gruda e a resposta de e-mail não volta para o chamado.

`JWT_SECRET` e `CHANNEL_SECRET_KEY` não precisam de ninguém: o
`subir-ndesk.sh` gera os dois quando estão curtos ou com o `TROQUE` do
exemplo, e nunca troca um que já esteja bom (trocar o
`CHANNEL_SECRET_KEY` de uma instalação em uso tornaria ilegíveis as
senhas de canal já cifradas).

Só no modo de conector próprio: `TUNNEL_TOKEN` e `COMPOSE_PROFILES=tunnel`
em `/opt/norty-desk/infra/.env`, e `DESK_BIND=127.0.0.1`.

### 5. Subir

```bash
ssh root@thor 'pct exec <ID> -- bash -lc \
  "cd /opt/norty-desk && bash scripts/subir-ndesk.sh"'
```

O `subir-ndesk.sh` recusa antes de subir pela metade: `DATABASE_URL`
vazio ou com a senha de exemplo, conector externo com o front preso no
loopback, profile `tunnel` sem token, ou sem rota até o Postgres. No
fim ele diz para onde a rota do túnel tem de apontar.

O build da API é pesado em disco (copia o `node_modules` inteiro). Fora
da janela de backup leva minutos; dentro dela, pode levar horas — ver
"Se der errado".

### 6. Semear, uma vez só

```bash
ssh root@thor 'pct exec <ID> -- bash -lc \
  "cd /opt/norty-desk && docker compose -f infra/docker-compose.yml \
   --env-file infra/.env exec -T desk-api npm run db:seed"'
```

**Sem** `-w @norty-desk/api`: a imagem de runtime não leva o
`package.json` raiz dos workspaces, e o npm responde "No workspaces
found". O seed cria a organização `norty` e cinco contas `@desk.test`
com senha aleatória que ninguém conhece — desative-as depois de criar
os administradores de verdade.

### 7. A rota, no painel da Cloudflare

Zero Trust → Networks → Tunnels → `norty-thor-yugo-family` →
**Published application routes** → `chamados.norty.com.br` →
Type `HTTP`, URL `<IP da NDesk>:3060` (sem `http://` no campo URL — o
Type já define o esquema). **Edite a rota existente; não crie outra.**

Esse túnel carrega mais de vinte sites de produção: mexa só na linha do
`chamados`.

No modo de conector próprio a rota é `http://desk-web:80`, nome de
serviço da rede do compose — que só resolve de dentro da NDesk.

---

## Como saber que deu certo

```bash
# 1. os contêineres de pé (três no modo externo; quatro no próprio)
ssh root@thor 'pct exec <ID> -- docker ps --format "{{.Names}}\t{{.Status}}"'
#    desk-api (healthy), desk-worker, desk-web (healthy)

# 2. a API responde por dentro
ssh root@thor 'pct exec <ID> -- curl -s localhost:3060/api/v1/health'

# 3. o conector alcança o front (CT 102 é onde ele roda)
ssh root@thor 'pct exec 102 -- curl -s -o /dev/null -w "%{http_code}\n" http://<IP>:3060/'

# 4. o mundo enxerga
curl -sS -o /dev/null -w '%{http_code}\n' https://chamados.norty.com.br
```

E o que prova que a retaguarda continua intacta:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://desk.norty.com.br
```

Se o `chamados` não der 200, descubra **para onde o conector está
mandando** com uma sonda de marca única:

```bash
# do thor:
ts=$(date +%s); curl -s -o /dev/null https://chamados.norty.com.br/sonda-$ts
pct exec 102 -- docker logs --tail 60 yugo-family-cloudflared 2>&1 \
  | grep -v eyJ | grep "sonda-$ts"
```

A linha traz `error="..."` com o destino exato. Use `--tail` curto:
`docker logs --since` devolveu zero linhas nesses conectores, e dumps
grandes via `pct exec` chegaram truncados no fim.

## Se der errado

- **`storage 'local-lvm' does not exist`** → versão antiga do script.
  A atual copia o armazenamento da referência; ou passe
  `ARMAZEM=local-srv`.
- **`docker` sobe e morre no LXC** → faltou `nesting=1`. Conserto:
  `pct set <ID> --features nesting=1,keyctl=1 && pct reboot <ID>`.
- **Não alcança o Postgres do CT 102** → é rota, não é o Desk. Não
  contorne pondo banco na máquina nova sem falar com o Yuri: a infra
  compartilhada é decisão de arquitetura dele.
- **`password authentication failed for user "nortydesk"`** → o role
  do exemplo não existe no CT 102. Ver a seção 4.
- **Todo login dá 500 logo depois de um deploy** (`column ... does not exist`
  no log da API) → a migração não rodou. Versões antigas do `subir-ndesk.sh`
  migravam *depois* de subir: se o `up` abortava esperando o healthcheck (no
  HDD do thor, a API demora), a migração nunca rodava. Foi o que deixou o login
  em 500 por 13 minutos em 10/09/2026. Conserto imediato:
  `docker exec -w /app/apps/api desk-api npx prisma migrate deploy`. O script
  atual migra antes de subir, com a imagem nova.
- **API em laço de reinício, `JWT_SECRET ausente ou curto demais`** →
  rode o `subir-ndesk.sh` atual, que gera o segredo.
- **API morre no boot com `libssl.so.1.1: No such file or directory`**
  → imagem construída sem o `openssl` que o `api.Dockerfile` atual
  instala antes do `prisma generate`. Reconstrua.
- **`npm error No workspaces found`** no seed → tire o `-w`.
- **502, e a sonda mostra `lookup desk-web ... no such host`** → a rota
  aponta para `http://desk-web:80`, que só existe no modo de conector
  próprio. No modo externo é `http://<IP da NDesk>:3060`.
- **O painel mostra a rota certa e a sonda ainda bate no destino
  antigo** → a configuração não está chegando ao conector. Procure
  `control stream encountered a failure` no log dele: com o canal de
  controle (QUIC) em laço, o conector segue "Connected" no painel e
  servindo a versão velha em cache. Compare a versão da última
  `Updated to new configuration` com a do painel. Reiniciar o conector
  faz ele buscar a versão atual na partida — mas é produção (CT 102,
  mais de vinte sites) e só com o aval do Yuri. Em 10/09/2026 foi assim:
  preso na versão 16, recebeu a 20 no restart. A falha é crônica nos
  conectores QUIC do thor; a correção durável é `--protocol http2`.
- **Build parece travado** (cache parado, processos em 0% de CPU) → meça
  antes de concluir. O `/srv` do thor é um HDD só, e os jobs de backup
  (Grupo A seg/qua/sex, Grupo B ter/qui/sáb, 23:30) saturam o disco.
  Em 20 s, `grep -w loopN /proc/diskstats` no host: se o tempo de
  leitura acumulado passa do tempo decorrido, é saturação, não
  travamento. Espere a janela ou peça ao Yuri para adiar o job.
- **A NDesk em DHCP** → versão antiga do script. Fixe:
  `pct set <ID> --net0 name=eth0,bridge=vmbr0,gw=<gw>,hwaddr=<o atual>,ip=<IP>/24,type=veth`.
  A troca a quente deixa o IP antigo como secundário até o próximo
  reboot.

## Ao terminar, relate

Ao Yuri, em texto: o tipo e o id da máquina criada, quais contêineres
estão de pé, o código HTTP de `chamados.norty.com.br`, o de
`desk.norty.com.br` (que tem de continuar como antes), e qualquer passo
que você tenha pulado ou improvisado. **Não inclua o token em nada
disso.**
