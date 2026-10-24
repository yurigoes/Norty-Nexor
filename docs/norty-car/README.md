# Norty Car | Sistema de Controle de Carros

Gestão de locadoras de veículos do ecossistema Norty: frota, reservas e
contratos, vistorias com fotos, manutenção e estoque, infrações e sinistros,
financeiro com caução separado, portal do cliente, site público com domínio
próprio, Master Norty e API de integração — multiempresa, com isolamento por
empresa e filial garantido também no banco.

> O Norty Car convive neste monorepo com o **my Home** (gestão condominial).
> Os dois produtos não compartilham código de domínio nem banco.

## Estrutura

```
packages/car-shared   Domínio, permissões, regras puras (preço, caução, parcelas,
                      documentos, manutenção, rentabilidade) e contratos de API
apps/car-api          API REST — NestJS + Prisma + PostgreSQL (porta 3334)
apps/car-web          Aplicativo, portal, Master e sites — React + Vite (porta 5174)
infra/norty-car       Dockerfiles, compose, nginx, Caddy, guia de implantação
scripts/norty-car     bootstrap e backup
docs/norty-car        Esta documentação
```

## Desenvolvimento local

Pré-requisitos: Node 22+, PostgreSQL 16 (com a extensão `btree_gist`
disponível).

```bash
# 1. Banco (papel SEM superusuário e SEM BYPASSRLS — o RLS precisa valer para ele)
sudo -u postgres psql -c "CREATE ROLE nortycar LOGIN PASSWORD 'troque' CREATEDB NOSUPERUSER NOBYPASSRLS;"
sudo -u postgres psql -c "CREATE DATABASE nortycar_dev OWNER nortycar;"
sudo -u postgres psql -c "CREATE DATABASE nortycar_test OWNER nortycar;"
sudo -u postgres psql -d template1 -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"

# 2. Configuração
cp apps/car-api/.env.example apps/car-api/.env      # preencha DATABASE_URL, JWT_SECRET, SECRETS_KEY
cp apps/car-web/.env.example apps/car-web/.env

# 3. Instalação, migrações e dados
npm install
npm run build -w @nortycar/shared
npm run db:car:migrate
npm run db:car:seed          # planos (preço a definir no Master)
npm run db:car:demo          # OPCIONAL: duas locadoras de demonstração e contas por perfil

# 4. Rodar
npm run dev:car-api          # http://localhost:3334/v1
npm run dev:car-web          # http://localhost:5174
```

> Abra o aplicativo em `http://localhost:5174` (não em `127.0.0.1`): o cookie de
> sessão é `SameSite=Lax` e precisa que app e API estejam no mesmo site.

### Contas de demonstração (só com `db:car:demo`)

Senha de todas: `NortyCar#Demo2026` (ou `DEMO_PASSWORD`).

| Conta | Contexto |
|---|---|
| `master@nortycar.test` | Master Norty (em produção exige MFA) |
| `suporte@nortycar.test` | Suporte Norty (precisa de autorização da empresa) |
| `proprietario.alfa@nortycar.test` | Proprietário — todas as filiais |
| `gerente.alfa@nortycar.test` | Gerente de loja — Matriz, alçada R$ 2.000 |
| `atendente.alfa@nortycar.test` | Atendente de locação |
| `financeiro.alfa@nortycar.test` | Financeiro |
| `vistoriador.alfa@nortycar.test` | Vistoriador |
| `mecanico.alfa@nortycar.test` | Mecânico |
| `almoxarife.alfa@nortycar.test` | Almoxarife |
| `auditor.alfa@nortycar.test` | Auditor (somente leitura) |

Trocando `alfa` por `beta` você entra na segunda locadora — e confirma que uma
não enxerga nada da outra. As empresas de demonstração nascem **sem veículos,
clientes ou lançamentos**: o painel mostra os estados vazios de uma locadora
real no primeiro dia.

### Conta de apresentação (Araújo Veículos)

Para demonstrar o sistema com um único login:

```bash
npm run db:apresentacao -w @nortycar/api     # empresa Araújo Veículos, frota, site publicado
# e na API: DEMO_ROLE_SWITCH_EMAILS=demo@nortycar.test
```

Entre com `demo@nortycar.test` / `1234` (ou `DEMO_LOGIN_PASSWORD`). No menu do
usuário, **Modo apresentação — ver como** troca o perfil (Proprietário,
Atendente, Vistoriador, Mecânico…) e o menu se ajusta às permissões. Em
**Trocar empresa ou contexto** a mesma conta abre o portal do cliente e o
Master Norty. O site fica em `/site/araujo-veiculos`. A troca de perfil só
vale para os e-mails listados em `DEMO_ROLE_SWITCH_EMAILS` e é auditada; não
use em produção real.

Para subir a apresentação numa máquina com Docker (banco próprio, aplicativo
e túnel da Cloudflare, tudo num comando):

```bash
git clone https://github.com/yurigoes/Norty-Nexor.git && cd Norty-Nexor
git checkout claude/nexor-mvp-condominio-7zmymy
./scripts/norty-car/apresentacao.sh                          # link temporário *.trycloudflare.com
CLOUDFLARE_TUNNEL_TOKEN=<token> APP_HOST=car.seudominio.com \
  ./scripts/norty-car/apresentacao.sh                         # seu túnel: rota pública → http://web:80
```

## Testes

```bash
npm run test:car     # regras puras + integração contra o PostgreSQL de teste
```

A suíte de integração sobe a API compilada contra `nortycar_test`
(`TEST_DATABASE_URL` para outro endereço) e fala HTTP de verdade. Detalhes em
[TESTES.md](TESTES.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [ARQUITETURA.md](ARQUITETURA.md) | módulos, multiempresa, RLS, motor de disponibilidade, imutabilidade |
| [DECISOES.md](DECISOES.md) | decisões de arquitetura e o que se abriu mão |
| [MODELO-DE-DADOS.md](MODELO-DE-DADOS.md) | tabelas por escopo e restrições garantidas pelo banco |
| [SEGURANCA-LGPD.md](SEGURANCA-LGPD.md) | autenticação, autorização, arquivos, segredos, LGPD |
| [API.md](API.md) | API de integração e webhooks |
| [VISUALIZADOR-3D.md](VISUALIZADOR-3D.md) | como publicar modelos 3D por veículo |
| [PWA-OFFLINE.md](PWA-OFFLINE.md) | uso em campo e desenho do modo offline |
| [TESTES.md](TESTES.md) | estratégia e cobertura dos testes |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | o que está pronto, o que está pendente |
| [../../infra/norty-car/DEPLOY.md](../../infra/norty-car/DEPLOY.md) | implantação, backup e recuperação |
