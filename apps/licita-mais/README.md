# LICITA+

Aplicativo da plataforma de inteligência para oportunidades públicas.
**Inteligência para oportunidades públicas.**

Conta de verdade, banco de verdade, licitação de verdade: as telas leem a
API (`@nexor/licita-api`), que ingere o **PNCP** e tria cada contratação
contra o perfil da empresa.

> **Duas fontes de dados.** Sem API respondendo, o aplicativo cai num
> banco de demonstração em memória e **avisa em tela**, numa faixa que
> ninguém consegue não ver. O pior desfecho deste produto é alguém
> decidir preço sobre dado fictício achando que é edital publicado — por
> isso o modo de demonstração é anunciado, nunca silencioso.
>
> A escolha é resolvida uma vez, na subida, perguntando ao healthcheck se
> há API. O padrão não é fixo no HTML de propósito: se fosse
> "demonstração" e a substituição no deploy falhasse, produção serviria
> dado fictício em silêncio.

## Rodar

```bash
npm run dev -w @nexor/licita-mais      # http://localhost:5180
npm run lint -w @nexor/licita-mais     # verificação estática
npm run build:previa -w @nexor/licita-mais   # dist/licita-mais.html (arquivo único)
```

Módulos ES precisam de HTTP: abrir o `index.html` por `file://` não
funciona. O servidor de desenvolvimento é estático e sem dependência.

## Zero dependência de runtime

Nada de CDN, nada de `node_modules` em produção. Os ícones são SVG inline
no traço do Lucide (`src/lib/icons.js`) e os gráficos são SVG escrito à
mão (`src/lib/charts.js`).

Não é purismo: a prévia publicada roda sob uma política de segurança que
bloqueia host externo. Um ícone que falha em carregar deixa botão sem
rótulo visível, e um gráfico que não carrega deixa um buraco na tela. A
única exceção é a folha do Google Fonts, que é o host permitido.

## Estrutura

```
index.html
src/
  styles/
    tokens.css        cor, tipografia, espaço, raio, sombra, transição
    base.css          reset, tipografia base, foco visível
    layout.css        shell, sidebar, header, grades
    components.css    todos os componentes do Design System
    publico.css       landing, login e onboarding
  lib/
    dom.js            html`` com escape, seletores, delegação, foco preso
    format.js         moeda, data, prazo, CNPJ, faixa de score — tudo pt-BR
    icons.js          conjunto de ícones SVG
    router.js         rotas por hash
    store.js          preferências locais: tema, modo de lista, lidas
    charts.js         área, barras, colunas, empilhada + tooltip
    tabelas.js        modalidades do PNCP, UFs, ordenações
    config.js         qual fonte de dados, resolvida uma vez na subida
    http.js           porta única para a API: token, renovação, erros
    sessao.js         quem está logado; entrar, sair, restaurar
  dados/
    index.js          o que as páginas importam — não sabem quem responde
    api.js            resposta da API → cartão que as telas desenham
    demo.js           mesma interface, servida do banco fictício
  ui/
    brand.js          logo em SVG, nas cinco variantes
    primitives.js     Button, Input, Card, Modal, Drawer, Toast, Tabs…
    domain.js         CompatibilityScore, OpportunityCard, StatCard…
    autenticacao.js   moldura comum das telas de conta
  data/mock.js        banco de demonstração — só `dados/demo.js` o importa
  pages/              18 telas
  app.js              shell, rotas, guarda e ações globais
scripts/
  servidor.mjs        servidor estático de desenvolvimento
  build-previa.mjs    empacotador para arquivo único
  verificar.mjs       verificação estática
```

## Decisões que sustentam o resto

**As páginas não sabem de onde vem o dado.** Elas importam de `dados/`,
e lá dentro `api.js` e `demo.js` implementam a mesma interface. Foi o
que permitiu ligar a API sem reescrever quatorze telas — e é o que
mantém a prévia navegável sem servidor. A tradução entre o que a API
devolve e o cartão que a tela desenha mora num arquivo só: se cada
página lesse `valorEstimado` e `encerramentoProposta` direto, trocar um
nome de campo no servidor obrigaria a caçar quatorze arquivos.

**O access token nunca é persistido.** Ele vive em memória, vale 15
minutos e some ao fechar a aba. Guardar em `localStorage` entregaria a
sessão a qualquer XSS. O que sobrevive ao refresh é o cookie `httpOnly`,
que JavaScript não lê — e é ele que reergue a sessão na subida.

**Renovação em fila única.** A API rotaciona o refresh token a cada uso:
duas renovações simultâneas queimariam o token uma da outra e
derrubariam a sessão. Dez requisições que recebam 401 juntas esperam a
mesma promessa.

**Esconder o item de menu é conveniência; a guarda é a proteção.** Rota
protegida sem sessão redireciona para o login e guarda o destino — quem
abriu um link de oportunidade volta para ela, não para o painel.

**Filtro, ordenação e paginação acontecem no servidor.** Peneirar em
memória funciona com trinta licitações e desmorona com trinta mil, que é
o volume real de um mês de PNCP em três estados.

**Cor semântica fora da paleta da marca.** Se azul, verde e amarelo são
identidade, eles não podem *também* significar "ok", "atenção" e "erro" —
o leitor nunca saberia se a cor fala de marca ou de estado. Por isso
`--sucesso`, `--aviso` e `--erro` são tokens reservados, nunca
reaproveitados como cor de série em gráfico.

**Nenhum componente escreve cor literal.** Tudo sai de token, e é por
isso que o modo escuro liga trocando um atributo na raiz, sem tocar em
nenhum arquivo de componente. `verificar.mjs` falha o build se um `#hex`
aparecer fora de `tokens.css`.

**O amarelo nunca carrega texto.** `#FFCC00` rende 1.4:1 sobre branco.
Onde a cor precisa virar texto entra `--amarelo-texto`, escuro o
bastante para ser lido.

**Compatibilidade nunca é só cor.** O score sempre traz o número *e* a
palavra ("Alta", "Média"). Quem não distingue verde de amarelo continua
lendo o resultado. O mesmo vale para os alertas do cartão, que combinam
forma e cor.

**A conta do score fica aberta.** Cada recomendação mostra os sete
critérios, quanto cada um vale e quanto entrou. Percentual sem
justificativa é número mágico — e quem não pode discordar do critério
acaba não confiando na lista.

**Prazo vence nota no painel.** Uma oportunidade de 96% que encerra
semana que vem espera; uma de 78% que encerra amanhã, não.

## Gráficos

Quatro, não quatorze. As regras aplicadas vêm da disciplina de
visualização de dados:

- **Um eixo, sempre.** Volume e valor têm escalas diferentes, então são
  gráficos diferentes — nunca dois eixos Y no mesmo desenho.
- **Série única usa um tom só.** Ali a cor carrega magnitude, não
  identidade; variar a cor por barra inventaria uma categoria inexistente.
- **A única paleta categórica é a das participações**, e ela foi validada:
  `#00803E / #1677E8 / #D14343` passa em faixa de luminosidade, piso de
  croma, separação sob as três formas de daltonismo (ΔE ≥ 8 em todos os
  pares) e contraste contra a superfície. Ainda assim vem com legenda e
  rótulo direto, para a identidade não depender da cor.
- **Extremidade arredondada de 4px ancorada na base**, traço de 2px,
  grade recessiva, rótulo direto só no pico.

Os passos de gráfico são tokens próprios (`--grafico-1..3`), diferentes
dos hex da interface de propósito: o modo escuro precisa de passos
escolhidos, não de uma inversão automática.

## Empacotador da prévia

`build-previa.mjs` resolve o grafo de módulos, ordena por dependência e
concatena tudo num escopo só. É mínimo, e só funciona porque o código
obedece a três invariantes que `verificar.mjs` garante:

1. nenhum nome de topo se repete entre módulos;
2. nenhum `import()` dinâmico;
3. todo import relativo termina em `.js`.

Se alguma quebrar, o build falha alto em vez de gerar um arquivo
silenciosamente quebrado.

## Acessibilidade

Foco visível em tudo que recebe teclado, e nunca removido. Modal e gaveta
prendem o Tab e fecham no Esc. O switch é um `<input>` de verdade,
visualmente oculto com o padrão de 1px e clip — `width: 0` faria alguns
navegadores tirarem o campo da ordem de tabulação. Ícone decorativo é
`aria-hidden`; ícone que carrega significado ganha rótulo. `prefers-reduced-motion`
desliga as animações. Nenhuma informação depende só de cor.

## O que a plataforma não faz

O LICITA+ encontra, analisa e organiza. **Não envia proposta e não dá
lance** — e isso aparece na interface, não só aqui. O envio é feito pelo
fornecedor na plataforma oficial do órgão, com certificado digital,
porque proposta é ato juridicamente vinculante e a responsabilidade é de
quem assina.

## Deploy — Thor (Proxmox)

| | |
|---|---|
| Container | **CT 103 Vanaheim** (`norty-apps-fase1`, `192.168.15.73`) |
| Código no host | `/srv/apps-fase1/licita-mais` |
| Caminho no CT | `/opt/licita-mais` (bind-mount) |
| Porta | `3500` (ajustável por `LICITA_PORT`) |
| Domínio | `licita.norty.com.br` via Cloudflare Tunnel |

```bash
ssh -i ~/.ssh/norty_cluster_ed25519 root@100.91.185.42
/srv/apps-fase1/licita-mais/deploy-thor.sh
```

### O mount point é o primeiro passo, e ele custa um reboot

No **CT 103 o bind-mount é por app** (`/srv/apps-fase1/bolao →
/opt/bolao`), diferente do 104 e do 105, que montam a pasta da fase
inteira. Um app novo ali precisa de um mount point novo — e em LXC
mount point só aparece depois de reiniciar o container.

O script **nunca reinicia o CT**. Se o mount faltar, ele imprime o
comando e para:

```bash
pct set 103 -mp9 /srv/apps-fase1/licita-mais,mp=/opt/licita-mais
pct reboot 103
```

**Reiniciar o 103 derruba junto Bolão da Galera, Central de Leads e
Sorva.** Faça numa janela combinada. Depois rode o script de novo.

### O que o script confere antes de mexer

CT existe, está rodando, enxerga o bind-mount, tem Docker, e a porta
está livre — distinguindo "ocupada por outro serviço" de "já é o
`licita-web`, então é redeploy". Só depois atualiza o código e
reconstrói. Nenhum outro app é tocado.

### Manualmente

```bash
# 1. no host thor
rsync -a --delete --exclude dist/ --exclude node_modules/ \
  <clone>/apps/licita-mais/ /srv/apps-fase1/licita-mais/

# 2. reconstrói dentro do CT
pct exec 103 -- bash -c 'cd /opt/licita-mais && docker compose up -d --build'

# 3. confere
pct exec 103 -- wget -qO- http://127.0.0.1:3500/ | head -3
```

### Cloudflare Tunnel

O compose publica **só a porta alta**, nunca 80 nem 443: quem termina
TLS é o túnel.

**Antes de procurar o `config.yml`, descubra o modo.** O `cloudflared`
roda de duas formas, e só uma delas tem arquivo:

- **Config local** — existe um `config.yml` com o bloco `ingress:`.
- **Gerenciado pelo dashboard** — sobe com `--token eyJ...` e **não há
  `config.yml` nenhum**. O ingress mora no Cloudflare Zero Trust, em
  *Networks → Tunnels → o túnel → Public Hostnames*.

Para descobrir qual é o caso e onde ele roda:

```bash
/srv/apps-fase1/licita-mais/achar-tunel.sh
```

O script varre o host e cada CT procurando processo, container Docker,
serviço systemd e arquivos nos caminhos usuais — `/etc/cloudflared/`,
`/root/.cloudflared/`, `~/.cloudflared/`. Só lê; não altera nem
reinicia nada. Ao encontrar, imprime o trecho atual do `ingress:` e diz
qual dos dois modos está em uso. O token aparece truncado.

Em modo config local, acrescente ao bloco `ingress:` **antes da regra
final de 404**:

```yaml
  - hostname: licita.norty.com.br
    service: http://192.168.15.73:3500
```

E registre o DNS uma vez só:

```bash
cloudflared tunnel route dns <nome-do-tunel> licita.norty.com.br
```

Depois recarregue o `cloudflared`. A ordem importa: a regra
`service: http_status:404` tem que continuar sendo a última do
`ingress`, senão ela engole tudo abaixo dela.

### Dois serviços, uma pasta

O `docker-compose.yml` sobe **`licita-web`** (nginx) e **`licita-api`**
(NestJS + Prisma). A API viaja dentro deste diretório, em `servidor/`, e
o domínio compartilhado em `compartilhado/` — o `deploy-thor.sh` monta
essa estrutura no host.

Não é organização caprichosa: no CT 103 o bind-mount é **por app**, e
criar um mount novo exige reiniciar o container, derrubando Bolão,
Central de Leads e Sorva junto. Uma pasta a mais aqui evita uma janela
de manutenção lá.

**A API não publica porta.** Só o nginx a alcança, pela rede interna do
compose. É o que garante que não exista caminho até a API que não passe
pelo mesmo domínio — e, portanto, pelo cookie de sessão.

### Por que a API é servida em `/v1` do mesmo domínio

O refresh token vive num cookie `httpOnly` com `SameSite=Lax`, que o
navegador **não envia numa requisição entre sites**. Com a API num
subdomínio (`api-licita.norty.com.br`), a sessão morreria a cada 15
minutos e o F5 derrubaria todo mundo. A alternativa seria afrouxar o
cookie para `SameSite=None` — trocar uma proteção real por conveniência
de arranjo. Servir sob `/v1` resolve cookie e CORS de uma vez.

### Banco e segredos

Postgres da Norty, no CT 102 (`192.168.15.72:5432`). Antes do primeiro
deploy:

```sql
CREATE DATABASE licita;
CREATE USER licita WITH PASSWORD '...';
GRANT ALL PRIVILEGES ON DATABASE licita TO licita;
```

Os segredos moram em `/srv/apps-fase1/licita-mais/.env`, **no host e
nunca no repositório** — o `deploy-thor.sh` preserva esse arquivo a cada
deploy justamente por isso. Veja `.env.example`; o mínimo é
`DATABASE_URL` e `JWT_SECRET` (`openssl rand -base64 48`).

A migração roda sozinha na subida do container, antes de servir: se
falhar, o container morre em vez de atender contra um esquema errado.

### A primeira carga não espera as 5h

A varredura do PNCP é diária, de madrugada. Depois do primeiro deploy o
painel estaria vazio até lá:

```bash
docker compose exec licita-api node dist/tarefas/ingestao.js
docker compose exec licita-api node dist/tarefas/ingestao.js BA SE
docker compose exec licita-api node dist/tarefas/ingestao.js --somente-avaliar
```

O último refaz só as notas, sem consultar o PNCP — é o que usar depois
de mexer nas linhas de fornecimento do perfil.

### Sem SMTP ninguém entra

O cadastro é aberto e a conta nasce **pendente de confirmação**. Sem
`SMTP_HOST` a API sobe, o cadastro responde certo e o link nunca sai — e
sem confirmar o e-mail o login recusa. É o bloco do `.env` que separa
"no ar" de "utilizável".

### Por que a imagem do aplicativo não tem passo de build

O app é HTML, CSS e módulos ES servidos como estão — o que roda em
produção é exatamente o que está no disco. (A imagem da API tem, e
precisa: TypeScript, Prisma e o domínio compartilhado são compilados
antes de rodar.) O primeiro estágio existe
só para rodar `verificar.mjs`: nome de topo duplicado, import sem
extensão ou cor literal fora dos tokens impedem a imagem de ser gerada.

### Notas do nginx

- **Cache curto com revalidação** em vez de um ano. Os arquivos não
  levam hash no nome, então cache longo serviria versão velha depois
  do deploy.
- **CSP restrita** a `self` mais Google Fonts, o único host externo
  que o app usa.
- **Sem bloco `types`.** No nginx um `types` em qualquer nível
  substitui o mapa MIME herdado inteiro em vez de complementá-lo; o
  mapa padrão já serve `.js` com o `text/javascript` que os módulos ES
  exigem.
