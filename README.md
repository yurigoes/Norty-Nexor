<div align="center">

# my Home · by norty

**O sistema operacional do condomínio.**

Fase 2 — aplicativo, API e banco de produção

</div>

---

## O que é esta entrega

Monorepo com o aplicativo web, a API e o domínio compartilhado entre os dois:

```
apps/web         React + Vite — 5 papéis, ~50 telas, design system próprio
apps/api         NestJS + Prisma — auth, RBAC, multi-tenant, módulos de negócio
packages/shared  Domínio, matriz de permissões e contratos de API
infra            docker-compose, Caddy com HTTPS automático, Dockerfiles
```

O domínio é compartilhado de propósito: os mesmos tipos e a mesma matriz de
permissões alimentam o menu do aplicativo e os guards da API. Uma mudança de
regra acontece em um lugar só, e o TypeScript aponta os dois lados afetados.

```
Aplicativo  →  API  →  Prisma  →  PostgreSQL
```

A demonstração navegável continua disponível com `VITE_DATA_SOURCE=mock`,
que usa o banco em memória e não precisa de servidor.

---

## Endereços

| | |
|---|---|
| Aplicativo | `myhome.norty.com.br` |
| API | `api-myhome.norty.com.br` |

---

## Como executar

```bash
npm install              # instala o monorepo inteiro
npm run dev:web          # aplicativo em http://localhost:5173
npm run dev:api          # API em http://localhost:3333/v1
npm run build            # shared → api → web
```

### Subir tudo em produção (no servidor)

```bash
git clone <repositorio> && cd my-home
cp infra/.env.example infra/.env     # preencha ACME_EMAIL
./scripts/bootstrap.sh               # --demo popula dados fictícios
```

Um comando só: constrói as imagens, sobe PostgreSQL, Redis, API, web e
Caddy, aplica as migrações, semeia o banco e confere a saúde dos
serviços. É seguro rodar de novo a cada atualização.

Aplicação em `http://localhost:5173`.

### Demonstração em arquivo único

```bash
npm run build:standalone   # gera dist-standalone/myhome-demo.html
```

Empacota a aplicação inteira — código, estilos e tipografia — em um único
HTML sem nenhuma referência externa. Serve para hospedar a demonstração em
qualquer lugar, enviar por anexo ou abrir localmente, sem depender de um
servidor que saiba reescrever rotas: nesse modo a navegação usa hash
(`#/app/visitantes`).

A tipografia embutida é gerada por `npm run fonts:embed`, que baixa as
faces uma única vez para `src/styles/fonts.embedded.css`.

---

## Contas de demonstração

Todas usam a senha **`123456`**.

| Perfil | E-mail | Contexto |
|---|---|---|
| Morador | `morador@myhome.test` | Carlos Almeida · Torre A · Apto 1204 |
| Portaria | `portaria@myhome.test` | Marcos Vieira · Portaria Principal |
| Síndico(a) | `sindico@myhome.test` | Helena Duarte · mandato 2025–2027 |
| Administrador | `admin@myhome.test` | Ricardo Monteiro · acesso amplo + portfólio |
| Administradora | `administradora@myhome.test` | Beatriz Salgado · 24 condomínios |

Na tela de login, clicar em uma das contas preenche as credenciais.

---

## Roteiro de demonstração

O caminho abaixo percorre os cinco fluxos completos exigidos pelo escopo.

### 1. Morador — `morador@myhome.test`

1. **Home** — identidade condominial digital: unidade, veículos, autorizados,
   funcionários, encomendas e acessos.
2. **Visitantes → Autorizar visitante** — preencher e gerar a autorização.
   O sistema emite um **QR Code** e o visitante aparece imediatamente na portaria.
3. **Visitantes → Criar evento** — gera convites individuais com QR para cada convidado.
4. **Veículos → Cadastrar veículo** — a placa passa a ser reconhecida na garagem.
5. **Reservas** — escolher área, data e horário; a disponibilidade é validada.
6. **Chamados → Abrir chamado** — a administração recebe na hora.
7. **Financeiro → Pagar boleto** — pagamento simulado com baixa registrada.
8. **Profissionais** — catálogo de prestadores indicados pelo condomínio, com
   nota, avaliações dos vizinhos, pedido de orçamento e histórico dos pedidos.
9. **my Home AI** — perguntar "Tenho alguma encomenda?" ou "Quando vence meu boleto?".

### 2. Portaria — `portaria@myhome.test`

1. **Console** — busca única resolve visitante, morador, unidade, placa e funcionário.
2. **Visitantes** — localizar o visitante criado no passo anterior e **Liberar**.
   A entrada é registrada e o morador recebe notificação.
3. **Validar QR Code** — digitar o código do convite para validar na guarita.
4. **Leitura de placa** — simular `ABC1D23` (autorizada) e `ABC9X88` (não cadastrada).
5. **Encomendas → Nova encomenda** para o apto 1204; depois registrar a retirada.
6. **Portões** — acionamento simulado com registro em auditoria.
7. **Modo monitor** — layout de tela cheia para o painel da guarita.

### 3. Síndico(a) — `sindico@myhome.test`

Dashboard com indicadores e gráficos, controle de acesso, financeiro
administrativo, chamados, ocorrências, manutenção, comunicados, documentos,
assembleias com votação, catálogo de profissionais indicados, central de
segurança e trilha de auditoria.

### 4. Administradora — `administradora@myhome.test`

Portfólio consolidado de 24 condomínios, indicadores agregados e troca de
contexto para a gestão de qualquer condomínio da carteira.

> Voltando ao morador, as notificações geradas pela portaria durante o roteiro
> já estarão lá — os papéis compartilham o mesmo estado.

---

## Arquitetura

```
src/
├── app/            Sessão, navegação, guards de rota e PWA
├── brand/          Identidade my Home (símbolo, lockup, composição visual)
├── components/
│   ├── ui/         Design system (24 componentes + tokens aplicados)
│   ├── charts/     Gráficos SVG próprios (área, barras, rosca, ranking)
│   └── …           Busca global, notificações, tabela de acessos, câmeras
├── data/
│   ├── types.ts    Modelo de domínio completo
│   ├── seed/       Gerador determinístico do condomínio fictício
│   ├── db.ts       Banco provisório (seed + journal de alterações)
│   └── repositories/  Única porta de acesso aos dados
├── layouts/        Shell da aplicação (sidebar desktop / bottom nav mobile)
├── lib/            Utilitários de data e formatação pt-BR
├── modules/
│   ├── auth/       Login
│   ├── resident/   Experiência do morador
│   ├── gate/       Console e operação da portaria
│   ├── management/ Gestão do condomínio
│   ├── portfolio/  Administradora multi-condomínio
│   └── shared/     Telas compartilhadas entre papéis
├── services/       Regras de negócio por domínio
└── styles/         Tokens, reset e utilitários
```

### Camada de dados provisória

O dataset **não é persistido**: ele é reconstruído de forma determinística a
cada carregamento a partir de uma semente fixa. Apenas as alterações feitas
durante a demonstração são gravadas, como um journal compacto de operações.

```
seed determinístico  +  journal de alterações  =  estado atual
```

Isso mantém o `localStorage` livre, torna a demonstração reprodutível em
qualquer máquina e faz de "reiniciar demonstração" apenas o descarte do journal.
O contador de **30 dias** de teste é exibido na barra lateral.

### Permissões e multi-tenant

`services/permissions.ts` define a matriz de papel → permissões. Cada rota é
protegida por permissão e a navegação é montada a partir dela: um módulo sem
permissão não aparece no menu nem é acessível por URL direta.

```
Tenant (administradora)
 └── Condomínio          dados, usuários e configurações próprios
      ├── Torres · Unidades · Vagas
      ├── Portarias · Áreas comuns
      ├── Veículos · Visitantes · Funcionários · Profissionais
      └── Financeiro · Documentos · Governança
```

### Concierge (my Home AI)

Definido por uma interface de provedor. O provedor local interpreta a intenção
da pergunta e responde consultando os **mesmos serviços** do restante da
aplicação — as respostas refletem os dados reais da demonstração. Na Fase 5,
registrar um provedor conectado a um modelo de linguagem não exige mudar
nenhuma tela.

---

## Dados da demonstração

**Residencial Parque Central** — São Paulo/SP

| | |
|---|---|
| Torres | 4 (Aurora, Boreal, Cristal, Diamante) |
| Unidades | 1.248 (26 andares × 12 unidades por torre) |
| Moradores | ~2.850 |
| Veículos | 734 |
| Funcionários e prestadores | ~330 |
| Áreas comuns | 10 |
| Portarias | 4 · Câmeras: 12 |
| Visitantes esperados hoje | 127 |
| Encomendas na portaria | ~85 |
| Chamados abertos | 23 · Ocorrências: 7 |
| Profissionais indicados | 45 · com avaliações escritas de moradores |
| Registros de acesso | ~12 mil (3 dias) |
| Boletos, lançamentos, documentos, assembleias | dataset completo |

Nenhum dado pessoal real é utilizado.

---

## Escopo desta fase

**Implementado e funcional**

Identidade visual · design system · login · dashboards · perfil e segurança ·
morador · portaria · visitantes · eventos com convite · veículos · controle de
acesso · leitura de placa simulada · encomendas · reservas · financeiro pessoal
e administrativo · chamados · ocorrências · comunicados · documentos ·
assembleias com votação · funcionários e prestadores · central de segurança ·
concierge · auditoria · multi-condomínio · responsividade · modo monitor · PWA.

**Simulado por decisão de escopo**

Pagamento e boleto bancário · integração bancária · reconhecimento de placa
real · abertura física de portão · CFTV · biometria · WhatsApp · IA de produção ·
assinatura digital · integração contábil.

Todos aparecem na arquitetura e no roadmap, com a experiência de uso completa.

---

## Roadmap

| Fase | Entrega |
|---|---|
| **1** | **MVP navegável — esta entrega** |
| 2 | Banco definitivo, autenticação real, API, logs, segurança e backup |
| 3 | Financeiro real: boletos, PIX, integração bancária e conciliação |
| 4 | Portaria real: controle de acesso, CFTV (ONVIF/RTSP), LPR e equipamentos |
| 5 | my Home AI conectado aos dados reais |
| 6 | Marketplace de prestadores, serviços e parceiros |

---

## Stack

React 19 · TypeScript · Vite · React Router · CSS com design tokens ·
gráficos SVG próprios · lucide-react.

Sem dependência de UI kit: o design system é próprio, o que mantém o controle
total da identidade my Home e o bundle enxuto.

---

<div align="center">
<sub><b>my Home</b> · by norty · Plataforma operacional para condomínios</sub>
</div>
