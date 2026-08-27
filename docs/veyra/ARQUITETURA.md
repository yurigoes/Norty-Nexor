# VEYRA — Arquitetura

> A inteligência por trás da operação comercial.
> Do primeiro contato à fidelização. Tudo conectado.

Plataforma SaaS multi-tenant para operações comerciais de consórcio,
seguros, planos de saúde e produtos financeiros. Não é um CRM com
módulos extras: é o ciclo comercial inteiro em um lugar só.

```
CAPTURA → IA → QUALIFICAÇÃO → ATENDIMENTO → COTAÇÃO → PROPOSTA →
VENDA → FINANCEIRO → COMISSÃO → PÓS-VENDA → RENOVAÇÃO → NOVA OPORTUNIDADE
```

## Onde o código mora

```
packages/veyra-core   Domínio, matriz RBAC e contratos de API
apps/veyra            Aplicativo React (apresentação + produto + admin)
docs/veyra            Esta documentação e o esquema PostgreSQL
```

```bash
npm install
npm run dev:veyra        # http://localhost:5273
npm run build:veyra
```

Três rotas, três cascas:

| Rota | O que é | Quem entra |
|---|---|---|
| `/` | Apresentação do produto, 40 seções | Qualquer visitante |
| `/app/*` | O produto, sob a sessão da empresa cliente | Usuários da organização |
| `/admin/*` | VEYRA Admin | Só o proprietário da plataforma |

A área administrativa **não** é uma tela dentro de `/app`. Ela tem rota,
casca e conjunto de permissões próprios, porque quem entra nela enxerga
*todas* as organizações. Misturá-la com o aplicativo do cliente seria a
maneira mais fácil de, um dia, vazar dado de uma empresa para outra —
bastaria um filtro esquecido.

## Regras de arquitetura

### 1. O domínio mora em `packages/veyra-core`

Tipos, matriz de permissões e contratos de API são compartilhados entre
o aplicativo e a API. Se um campo muda, muda em um lugar só, e o
TypeScript aponta os dois lados afetados. Nunca duplique um tipo de
domínio dentro de `apps/`.

### 2. A mesma matriz RBAC protege o menu e a rota

`ROLE_PERMISSIONS` esconde o item no aplicativo *e* alimenta o guard da
API. Ao criar um módulo, adicione a permissão em
`packages/veyra-core/src/permissions.ts` e declare-a no controller.
Esconder o botão é conveniência; o guard é a proteção.

A ordem da decisão em `podeExecutar` não é arbitrária:

1. módulo não contratado → não, mesmo para o administrador;
2. permissão revogada individualmente → não, mesmo que o papel conceda;
3. permissão extra concedida → sim;
4. matriz do papel → resposta padrão.

Nove papéis de sistema, oito ações granulares por módulo, vinte e quatro
módulos. Papéis personalizados são aditivos sobre essa base.

### 3. Todo dado é escopado por organização

O guard resolve `request.organizationId` uma vez, validando o vínculo do
usuário. Todo `where` de consulta começa por ele — e os índices do banco
também, por isso `leads_org_status` e não `leads_status`. Nenhum service
confia num identificador vindo do corpo da requisição.

### 4. Regra que não pode ser burlada vive no banco

Uma cota por grupo por administradora, uma avaliação por protocolo, uma
comissão por contrato/regra/competência/parcela, uma conversa aberta por
contato e canal: todas são `UNIQUE` no esquema. Validar só na aplicação
deixa duas requisições simultâneas passarem juntas.

### 5. Dinheiro é `NUMERIC(12,2)`, nunca `float`

Em ponto flutuante `0.1 + 0.2` não fecha caixa. Na fronteira da API o
decimal vira `number` uma única vez, no serializador do módulo.

### 6. Estilo vem de tokens

Cor, espaçamento, tipografia, raio e sombra estão em
`apps/veyra/src/styles/tokens.css`. Não introduza valor literal em CSS
de módulo.

A paleta é midnight + ciano + azul + violeta, com papéis rígidos:

| Token | Papel |
|---|---|
| `--vy-midnight` | fundo, profundidade, superfície |
| `--vy-cyan` | sinal ativo, IA, dado vivo |
| `--vy-blue` | ação primária, foco, link |
| `--vy-violet` | inteligência, previsão, acento |
| `--warning` | atenção — prazo apertado, pendência |
| `--danger` | só alerta real, nunca decoração |
| `--success` | confirmação, meta batida |

O gradiente da marca (ciano → azul → violeta, sempre na diagonal)
identifica o VEYRA. Se aparecer em toda superfície, deixa de
identificar: ele fica reservado à marca, à ação primária, ao indicador
de posição no menu e ao que a IA produziu.

O tema base é escuro porque a operação vive aberta o dia inteiro em três
telas. O tema claro é completo — nenhuma cor tem sua única definição
dentro de um bloco de tema.

### 7. Cor de série de dados não é cor de marca

`--chart-1` a `--chart-6` são um conjunto separado, validado contra o
fundo escuro e o claro: faixa de luminosidade fechada (nenhuma série
grita mais alto por ser mais clara), croma mínimo, separação sob
deuteranopia, protanopia e tritanopia acima de ΔE 8, contraste ≥ 3:1
contra a superfície escura.

A ordem é fixa: a série 1 é sempre `--chart-1`. Nunca cicle a paleta nem
repinte as séries sobreviventes quando um filtro reduz a contagem — a
cor segue a entidade, não a posição. Duas ou mais séries sempre trazem
legenda; até quatro trazem também rótulo direto, porque identidade nunca
pode depender só da cor.

### 8. Rótulo de interface vive em `app/rotulos.ts`

O domínio guarda a chave (`debito_automatico`); a interface guarda o
texto ("Débito automático"). Derivar um do outro com `capitalize`
produz "Debito Automatico" — e um produto que erra acento na própria
tela não passa a impressão de cuidado que precisa passar.

## A camada de IA

O VEYRA não terceiriza a própria inteligência. Toda resposta desce uma
ordem fixa e **para na primeira fonte que resolve**:

| Ordem | Fonte | Participação medida |
|---|---|---|
| 1 | Base interna do VEYRA | 52% |
| 2 | Conhecimento da empresa | 21% |
| 3 | Histórico autorizado | 7% |
| 4 | Dados do produto | 4% |
| 5 | Provedor externo | 16% |

Cada atendimento resolvido internamente responde em torno de 180 ms
contra 1.420 ms do provedor externo, e a uma fração do custo. Como a
base cresce a cada conversa registrada (`ai_knowledge`, alimentada só
com metadados anonimizados), o custo por atendimento **cai** com o uso.

`ai_interactions.fonte` é a coluna que permite medir isso — não é
promessa de marketing, é métrica no banco.

O provedor externo é peça trocável: a arquitetura prevê primário e
reserva, e nenhum fornecedor único pode virar ponto de falha nem
alavanca de preço. O mesmo vale para gateway de pagamento e canal de
mensagem.

## Segurança

Decisões que não devem ser desfeitas:

- Senha em Argon2id. A API nunca devolve o hash — o tipo do usuário
  autenticado (`AuthenticatedUser`) sequer tem o campo.
- Access token de 15 minutos guardado **em memória** no cliente. Nunca em
  `localStorage`, onde qualquer script da página o leria.
- Refresh token em cookie `httpOnly`, com rotação a cada uso e hash no
  banco. Um token roubado vale por um uso só.
- Login responde igual para e-mail inexistente e senha errada — a
  diferença revelaria quem tem conta.
- `forbidNonWhitelisted`: campo desconhecido no corpo é erro, não algo a
  ignorar em silêncio.
- Em produção, erro inesperado devolve mensagem genérica com código de
  rastreio. Stack trace e texto do Postgres ficam no log.
- 2FA por TOTP, obrigatório para administrador e financeiro.
- Credenciais de integração e segredos de webhook são cifrados antes de
  chegar ao banco: um dump não devolve tokens utilizáveis.
- Webhooks de saída assinados com HMAC-SHA256 sobre o corpo cru. Sem
  isso, quem descobrisse a URL poderia forjar "pagamento confirmado".

## LGPD

- Consentimento com titular, finalidade, base legal, canais e evidência.
- Blacklist verificada **no motor de envio**, não na tela de quem monta o
  público — assim a checagem não depende de ninguém lembrar.
- Reativação só mediante nova manifestação do titular, registrada.
- Exportação, anonimização e exclusão quando aplicável.
- `ai_knowledge` guarda a forma da pergunta e a resposta que funcionou,
  nunca nome, telefone ou documento.

## API

REST versionada em `/api/v1`, documentada em OpenAPI. A interface é o
primeiro consumidor da API, não um caso especial dela: tudo que a tela
faz, um sistema externo também faz, com a mesma autenticação, as mesmas
permissões e o mesmo limite de requisição.

O mapa em `packages/veyra-core/src/api.ts` declara a permissão de cada
rota. Rota sem `permissao` é rota pública — e isso precisa ser uma
decisão visível, não um esquecimento.

Limites por minuto, ajustados pelo plano: 120 padrão, 10 na
autenticação, 30 no disparo de campanha, 600 na entrada de webhook.

## Banco de dados

`schema.sql` traz o DDL completo — cerca de 50 tabelas normalizadas.
Pontos que merecem leitura:

- `plans.limites` é JSONB: `NULL` em um limite significa ilimitado, `0`
  significa bloqueado. São respostas diferentes para o mesmo campo.
- `consortium_details`, `policies` e `health_plans` estendem `contracts`
  em vez de virarem colunas nulas na mesma tabela — cota e carta não
  existem em apólice; franquia não existe em consórcio.
- `payments (provedor, referencia_externa)` é único: o webhook do
  provedor pode reentregar a mesma confirmação, e a unicidade é o que
  impede baixar a fatura duas vezes.
- `affiliate_leads` tem `lead_id` como chave primária: um lead pertence a
  um afiliado só, porque atribuição dupla é a origem clássica da disputa
  de comissão.
- `quotes.link_token` é aleatório e revogável. O número da cotação é
  sequencial e serviria de convite a enumerar as dos outros.

## Fases de entrega

A plataforma é completa, mas a entrega é por fases — e cada fase entrega
uma operação inteira funcionando, não um pedaço que só faz sentido
quando a próxima chegar.

| Fase | Nome | O que muda na operação |
|---|---|---|
| 1 | Core | Para de viver no WhatsApp pessoal. Lead entra, é qualificado e tem dono. |
| 2 | Comercial | Do interesse ao contrato assinado, com a comissão saindo junto. |
| 3 | Operação | O que foi vendido passa a ser acompanhado: vigência, renovação, pós-venda. |
| 4 | Financeiro | A receita deixa de ser estimativa. Cobrança, baixa e fluxo de caixa fecham. |
| 5 | Intelligence | A base acumulada vira previsão, score e recomendação. |
| 6 | Ecossistema | A plataforma vira infraestrutura para outros sistemas. |

O mapa de fase por módulo está em `packages/veyra-core/src/domain.ts`
(`FASES`) e em `modules.ts` (campo `fase`).

## Ecossistema de produto

`VEYRA` · `VEYRA CRM` · `VEYRA Connect` · `VEYRA Intelligence` ·
`VEYRA Finance` · `VEYRA Campaigns` · `VEYRA Partners` ·
`VEYRA Support` · `VEYRA Knowledge` · `VEYRA Admin`

Não são sistemas integrados: são o mesmo sistema lendo a mesma base. Por
isso o CSAT de um chamado aparece no cliente, e o cliente aparece na
conversa.

## Pilha proposta para produção

| Camada | Escolha |
|---|---|
| Aplicativo | React 19 + TypeScript + Vite |
| API | REST versionada, OpenAPI, JWT + refresh rotativo |
| Banco | PostgreSQL 16 |
| Cache | Redis |
| Filas | Fila com trabalhadores dedicados para disparo e automação |
| Arquivos | Armazenamento de objetos compatível com S3 |
| Tempo real | WebSocket para a caixa de conversas |
| Entrega | Contêineres atrás de proxy reverso |

O aplicativo desta entrega roda inteiramente no navegador com uma base
de demonstração determinística (`apps/veyra/src/data/base.ts`) — a mesma
que a API real substituirá módulo a módulo, sem mudar a interface.
