# 12 — Provisionar a NDesk (briefing para o agente local)

Este documento é para ser **entregue a um agente que roda na máquina do
Yuri**, com Tailscale, e que portanto alcança o thor — coisa que a
sessão em nuvem não faz. Ele descreve o que tem de acontecer, o que não
pode acontecer, e como saber que deu certo.

---

## O contexto, em cinco linhas

- O Norty Desk deste repositório ainda **não está no ar** em lugar
  nenhum. Ele sobe agora, numa máquina nova chamada `NDesk`, publicado
  em `https://chamados.norty.com.br` por túnel Cloudflare.
- `desk.norty.com.br` é **outra coisa**: uma aplicação Next.js num
  container `norty-desk` no heimdall, no ar desde agosto. Ela **fica de
  retaguarda e não se toca**.
- Não existe GLPI em máquina nenhuma da Norty. Se algum documento deste
  repositório disser o contrário, ele está desatualizado — veja a
  correção no topo de `docs/00-visao.md`.

## O que NÃO pode acontecer

1. **Não tocar no heimdall.** Nem no container `norty-desk`, nem no
   `norty-caddy`, nem no DNS de `desk.norty.com.br`. É a retaguarda em
   produção.
2. **Não mexer nos doze containers que já existem no thor.** O script
   escolhe um id livre a partir do 120 e recusa se o nome já existir,
   mas a regra vale para qualquer comando manual: confirme o alvo pela
   tabela antes de agir, não escaneie às cegas.
3. **Não colar o `TUNNEL_TOKEN` em conversa, log, captura de tela ou
   commit.** Ele é o segredo que substitui a senha do servidor: quem o
   tem publica no lugar da VM. Se vazar, o remédio é revogar o túnel na
   Cloudflare e gerar outro.
4. **Não usar `--force`, não recriar máquina existente, não apagar
   volume.** Se algo já existe, pare e pergunte.

## Decisão a tomar antes de começar

O Yuri pediu "VM". O parque inteiro do thor é **LXC** (`pct`), incluindo
os containers que já rodam Docker. Os dois caminhos funcionam:

| | LXC (`TIPO=lxc`, padrão) | VM (`TIPO=vm`) |
|---|---|---|
| Igual ao resto do parque | sim | não |
| Consumo | menor | maior |
| Docker | precisa de `nesting=1` (o script já põe) | nativo |
| Isolamento | menor | maior |
| Passos até o fim | script vai até o fim | script cria e **para**: o resto exige SSH na VM |

Pergunte ao Yuri qual ele quer. Na dúvida, LXC — é o padrão da casa, e
o script leva até o fim.

## O passo a passo

### 1. Chegar no thor

Pelo Tailscale. Confirme que é o thor antes de qualquer coisa:

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

Ele pede confirmação digitada (`SIM`) antes de criar qualquer coisa —
por isso o `-t`. Ele instala Docker, clona o repositório em
`/opt/norty-desk` e testa se a máquina nova alcança o Postgres
compartilhado do CT 102 (`192.168.15.72:5432`).

### 4. Os dois segredos

Só o Yuri tem. Peça a ele, e escreva **na máquina nova**, nunca em
conversa:

- `/opt/norty-desk/infra/.env` → `TUNNEL_TOKEN=...`
  (Cloudflare → Zero Trust → Networks → Tunnels → o de
  `chamados.norty.com.br` → Configure → token do conector)
- `/opt/norty-desk/apps/api/.env` → `DATABASE_URL=...` e
  `WEB_ORIGIN=https://chamados.norty.com.br`

`WEB_ORIGIN` **tem** de bater com o domínio do túnel: é ele que assina o
cookie de sessão e monta o Message-ID do e-mail. Errado, o login não
gruda e a resposta de e-mail não volta para o chamado.

### 5. Subir

```bash
ssh root@thor 'pct exec <ID> -- bash -lc \
  "cd /opt/norty-desk && bash scripts/subir-ndesk.sh"'
```

O `subir-ndesk.sh` recusa antes de subir pela metade: sem token, sem
`DATABASE_URL`, ou sem rota até o Postgres, ele para dizendo o motivo.

### 6. Semear, uma vez só

```bash
ssh root@thor 'pct exec <ID> -- bash -lc \
  "cd /opt/norty-desk && docker compose -f infra/docker-compose.yml \
   --env-file infra/.env exec -T desk-api npm run db:seed -w @norty-desk/api"'
```

### 7. O túnel, no painel da Cloudflare

O túnel de `chamados.norty.com.br` aponta para **`http://desk-web:80`** —
nome de serviço da rede do compose, não IP. A máquina não abre 80 nem
443: quem fala com o mundo é o `cloudflared`, de dentro para fora.

---

## Como saber que deu certo

```bash
# 1. o túnel conectou
ssh root@thor 'pct exec <ID> -- docker logs desk-tunnel 2>&1 | tail -5'
#    procure "registered tunnel connection"

# 2. os quatro contêineres de pé
ssh root@thor 'pct exec <ID> -- docker ps --format "{{.Names}}\t{{.Status}}"'
#    desk-api, desk-worker, desk-web, desk-tunnel

# 3. a API responde por dentro
ssh root@thor 'pct exec <ID> -- curl -s localhost:3060/api/v1/health'

# 4. o mundo enxerga
curl -sS -o /dev/null -w '%{http_code}\n' https://chamados.norty.com.br
```

E o que prova que a retaguarda continua intacta:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://desk.norty.com.br
```

## Se der errado

- **`docker` sobe e morre no LXC** → faltou `nesting=1`. Conserto:
  `pct set <ID> --features nesting=1,keyctl=1 && pct reboot <ID>`.
- **Não alcança o Postgres do CT 102** → é rota, não é o Desk. Não
  contorne pondo banco na máquina nova sem falar com o Yuri: a infra
  compartilhada é decisão de arquitetura dele.
- **Túnel não conecta** → token errado ou túnel apagado no painel.
  Confira o log do `desk-tunnel`; ele diz qual dos dois.
- **Sobe mas dá 502** → o túnel está apontando para o lugar errado. Tem
  de ser `http://desk-web:80`.

## Ao terminar, relate

Ao Yuri, em texto: o tipo e o id da máquina criada, quais dos quatro
contêineres estão de pé, o código HTTP de `chamados.norty.com.br`, o de
`desk.norty.com.br` (que tem de continuar como antes), e qualquer passo
que você tenha pulado ou improvisado. **Não inclua o token em nada
disso.**
