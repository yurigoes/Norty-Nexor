# LICITA+

Front-end da plataforma de inteligência para oportunidades públicas.
**Inteligência para oportunidades públicas.**

> Protótipo comercial. Todos os dados são fictícios e a interface diz isso
> em tela — um protótipo que insinua dado real cria expectativa que o
> produto ainda não pode cumprir.

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
    store.js          estado com assinatura + localStorage
    charts.js         área, barras, colunas, empilhada + tooltip
  ui/
    brand.js          logo em SVG, nas cinco variantes
    primitives.js     Button, Input, Card, Modal, Drawer, Toast, Tabs…
    domain.js         CompatibilityScore, OpportunityCard, StatCard…
  data/mock.js        órgãos, licitações, monitoramentos, participações
  pages/              14 telas
  app.js              shell, rotas e ações globais
scripts/
  servidor.mjs        servidor estático de desenvolvimento
  build-previa.mjs    empacotador para arquivo único
  verificar.mjs       verificação estática
```

## Decisões que sustentam o resto

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

Segue a regra de ouro da infra Norty: **o código mora no host** em
`/srv/apps-fase<N>/licita-mais` e entra no CT pelo bind-mount já
existente em `/opt/fase<N>`. Edita-se no host, reconstrói-se dentro do
container.

```bash
ssh -i ~/.ssh/norty_cluster_ed25519 root@100.91.185.42     # thor
cd /srv/apps-fase3/.licita-mais-repo 2>/dev/null || true
bash <(curl -fsSL https://raw.githubusercontent.com/yurigoes/Norty-Nexor/claude/gov-bidding-automation-4jopo0/apps/licita-mais/deploy-thor.sh)
```

Ou, com o repositório já clonado no host:

```bash
CT=105 FASE=3 /srv/apps-fase3/licita-mais/deploy-thor.sh
```

O script confere antes de mexer em qualquer coisa: se o CT existe, se
está rodando, se o bind-mount está visível de dentro dele e se há
Docker lá. Só depois atualiza o código e manda reconstruir. Nenhum
outro app é tocado — só o diretório do LICITA+ e só o compose dele.

Manualmente, o mesmo em três passos:

```bash
# 1. no host thor
rsync -a --delete --exclude dist/ --exclude node_modules/ \
  <clone>/apps/licita-mais/ /srv/apps-fase3/licita-mais/

# 2. reconstrói dentro do CT
pct exec 105 -- bash -c 'cd /opt/fase3/licita-mais && docker compose up -d --build'

# 3. confere
pct exec 105 -- wget -qO- http://127.0.0.1:3060/ | head -3
```

### Porta e ingress

O compose publica **só uma porta alta no CT** (`3060` por padrão,
ajustável por `LICITA_PORT`). Ele nunca toma 80 nem 443: quem termina
TLS e resolve o domínio é o ingress da Norty. Um serviço tomando a 443
aqui brigaria com tudo o que já serve domínio no Thor.

Depois do container de pé, falta apontar `licita.norty.com.br` para
`192.168.15.75:3060` no ingress — Cloudflare Tunnel ou o proxy que
estiver na frente.

### Sem banco, sem Redis

O LICITA+ hoje é front-end estático com dados de demonstração: não
toca a infra compartilhada do CT 102. Quando ganhar API, a
`DATABASE_URL` aponta para `192.168.15.72:5432` como os outros apps.

### Por que a imagem não tem passo de build

O app é HTML, CSS e módulos ES servidos como estão — o que roda em
produção é exatamente o que está no disco. O primeiro estágio existe
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
