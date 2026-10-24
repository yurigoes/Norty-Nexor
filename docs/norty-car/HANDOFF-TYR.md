# Passagem — subir a apresentação do Norty Car na Tyr

Documento para a sessão do Claude Code que roda **no PC do usuário** (com SSH e
Tailscale) continuar o trabalho iniciado numa sessão na nuvem, que não alcança
a rede da Norty.

## Onde está o código

| | |
|---|---|
| Repositório | `https://github.com/yurigoes/Norty-Nexor` |
| Branch | `claude/nexor-mvp-condominio-7zmymy` |
| Último commit relevante | "Norty Car: stack de apresentação em um comando (banco, app e túnel)" |
| Sessão de origem (para `claude --teleport`) | `session_01SBcp5NaZ4ic3Mj7xU6pSmf` |

O monorepo tem dois produtos independentes: **my Home** (`apps/api`, `apps/web`,
já em produção no CT 105) e **Norty Car** (`apps/car-api`, `apps/car-web`,
`packages/car-shared`). O objetivo agora é só o Norty Car. **Não mexa no my Home
nem nos contêineres que já estão rodando.**

Leia antes: `CLAUDE.md`, `docs/norty-car/README.md`,
`docs/norty-car/IMPLEMENTATION_STATUS.md`, `infra/NORTY.md`,
`infra/norty-car/DEPLOY.md`.

## Objetivo

Deixar o Norty Car acessível por um link público para uma **apresentação
comercial**, com:

- login único `demo@nortycar.test`, senha `1234`;
- troca de perfil no menu do usuário → "Modo apresentação — ver como";
- portal do cliente e Master Norty por "Trocar empresa ou contexto";
- empresa **Araújo Veículos** com frota, tarifas e site publicado em
  `/site/araujo-veiculos`.

## Infraestrutura (o que se sabe)

- **Tyr** é um host **Proxmox** com vários contêineres LXC. Endereço Tailscale e
  usuário SSH: **pergunte ao usuário** (não estão no repositório).
- Convenção da Norty (de `infra/NORTY.md`): apps em contêiner com Docker (o my
  Home roda no **CT 105 Asgard**, `192.168.15.75`, portas 3060/3061); Postgres e
  Redis compartilhados no **CT 102 Yggdrasil**, `192.168.15.72`; borda pelo
  **Cloudflare Tunnel**. O documento cita o host "thor"
  (`root@100.91.185.42`, chave `~/.ssh/norty_cluster_ed25519`). Confirme com o
  usuário se Tyr é a mesma máquina ou outra.
- O usuário tem o **token do Cloudflare Tunnel**; peça a ele, não grave em
  arquivo versionado.

## Como subir (caminho preparado)

`scripts/norty-car/apresentacao.sh` sobe uma stack **autocontida** definida em
`infra/norty-car/apresentacao/docker-compose.yml`:

| Serviço | O que é |
|---|---|
| `db` | PostgreSQL 16 próprio; cria o papel `nortycar` **sem** superusuário e sem BYPASSRLS (o RLS depende disso) e a extensão `btree_gist` |
| `api` | API do Norty Car (imagem de `infra/norty-car/api.Dockerfile`), com `MFA_REQUIRED_PLATFORM=false` e `DEMO_ROLE_SWITCH_EMAILS=demo@nortycar.test` |
| `web` | aplicativo + nginx com proxy de `/v1` para a API no **mesmo endereço** (porta `WEB_PORT`, padrão 3070) |
| `tunnel` | cloudflared: com `CLOUDFLARE_TUNNEL_TOKEN` roda o túnel nomeado; sem token abre um `*.trycloudflare.com` |

O script gera segredos em `infra/norty-car/apresentacao/.env` (fora do git),
constrói as imagens, aplica as migrações, roda `prisma/seed.ts` (planos) e
`prisma/apresentacao.ts` (Araújo + conta demo), sobe tudo e imprime o link.
É idempotente; `--parar` derruba sem apagar os volumes.

### Passos sugeridos

1. Entrar na Tyr por SSH e listar os contêineres (`pct list`).
2. Escolher **com o usuário** onde rodar: um CT que já tenha Docker e espaço
   (≈ 3 GB para as imagens) ou um CT novo. **Não** instalar Docker no host
   Proxmox. **Pergunte antes de criar ou alterar qualquer CT.**
3. Dentro do CT: `git clone` do repositório, `git checkout` do branch.
4. Rodar o script (ver a decisão do túnel abaixo).
5. Testar: abrir o link, entrar com `demo@nortycar.test` / `1234`, trocar para
   "Vistoriador" e voltar; abrir `/site/araujo-veiculos`.

### Decisão do túnel — importante

- Se o token for de um **túnel que já serve outros apps** (o caso provável),
  **não** passe esse token ao script: um segundo conector do mesmo túnel dentro
  da rede do Docker não alcança os outros apps, e as requisições seriam
  divididas entre os conectores. Nesse caso rode o script **sem** token e, no
  painel da Cloudflare, adicione um *public hostname* (por exemplo
  `car.norty.com.br`) para `http://<IP-do-CT>:3070`. Depois rode de novo com
  `APP_HOST=car.norty.com.br ./scripts/norty-car/apresentacao.sh` para o
  aplicativo reconhecer o domínio.
- Se for um **túnel novo, só para isso**, rode com
  `CLOUDFLARE_TUNNEL_TOKEN='...' APP_HOST='car.seudominio' ./scripts/norty-car/apresentacao.sh`
  e aponte o *public hostname* para `http://web:80`.
- Sem domínio: o script sem token já devolve um link `*.trycloudflare.com`
  (muda a cada reinício do contêiner `tunnel`).

## O que não foi testado

- As **imagens Docker nunca foram construídas**: o sandbox da nuvem não alcança
  os repositórios do Alpine. O primeiro build acontece na Tyr; se falhar,
  corrija o Dockerfile, rode de novo e faça commit da correção neste branch.
- O fluxo com API relativa (`/v1`) foi testado sem Docker (build do app com
  `VITE_API_URL=/v1` + proxy local): login, recarregar, troca de perfil e site
  funcionaram.
- Suíte: 132 testes de integração + 15 de regras passando
  (`npm run test:car`, precisa de PostgreSQL local — não é necessário para a
  apresentação).

## Problemas prováveis e saída

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `docker compose up --wait` não existe | compose antigo | atualizar o plugin compose ou trocar por `up -d db` + espera |
| API reinicia com erro de `SECRETS_KEY`/`JWT_SECRET` | `.env` editado à mão | apagar `infra/norty-car/apresentacao/.env` e rodar de novo (só antes de haver dados) |
| link abre o **site** em vez do aplicativo | host não está em `APP_HOSTS` | rodar de novo com `APP_HOST=<domínio>` (o build do web lê isso) |
| login volta para a tela de entrada ao recarregar | acesso por `http://IP` sem HTTPS (cookie `Secure`) | usar o link do túnel ou `http://localhost:3070` dentro do CT |
| `prisma/apresentacao.ts` não acha `dist/common/provisioning` | imagem antiga | `docker compose ... build api` de novo |
