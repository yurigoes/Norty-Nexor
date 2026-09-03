# Estudo — Antifraude de pesagem com CFTV Intelbras + RFID

Sistema que amarra **quem pesou**, **o que foi pesado** e **a imagem do
momento**, gravando os três juntos e tornando o conjunto pesquisável.

> Status: estudo de viabilidade. Nada implementado. Este documento existe
> para decidir hardware e escopo antes de escrever a primeira linha.
>
> Produto **SaaS para o varejo** — não há parque instalado de cliente
> ainda, então as decisões abaixo valem como padrão de referência.
>
> A lógica de baixa, cancelamento e alerta está em
> [`antifraude-conciliacao-etiquetas.md`](./antifraude-conciliacao-etiquetas.md).

---

## 1. Resposta curta

Sim, dá para fazer — e sem gambiarra nas três pontas:

| Ponta | Como | Maturidade |
|---|---|---|
| Sobrepor texto no vídeo | Função **POS/PDV** dos gravadores e câmeras Intelbras (recebe texto por rede, queima na gravação e indexa para busca) | Recurso de fábrica |
| Identificar o funcionário | **Balança com leitor RFID integrado** (Toledo Prix 5 Plus) ou leitor externo no *edge* | Produto de prateleira |
| Capturar a pesagem | Software de gerenciamento da balança (Toledo MGV6/MGV7, Urano Integra) — registra transação, peso, valor **por operador**, com arquivo-texto e web service | Recurso de fábrica |

O trabalho de engenharia não está em nenhuma das três pontas isoladas.
Está em **correlacionar** os eventos, em **tempo real**, e em transformar
isso num painel que aponte a fraude — não só num vídeo bonito.

---

## 2. O que realmente é a fraude

O overlay na câmera é o meio, não o fim. Colocar nome e produto na tela
inibe, mas quem quer fraudar continua fraudando na frente da câmera. As
perdas de verdade em açougue/padaria/hortifruti são:

1. **Etiqueta impressa que nunca vira venda.** Pesa, etiqueta, o produto
   sai pela porta ou pelo caixa com cúmplice. É a maior fonte de perda —
   e só aparece reconciliando *etiquetas geradas × cupons fiscais*.
2. **Troca de código.** Pesa picanha digitando o código de osso ou
   banana. Detectável por faixa de peso/valor esperada por SKU.
3. **Pesagem sem identificação.** Uso do operador genérico/supervisor.
4. **Reimpressão e cancelamento** acima do padrão do setor.
5. **Tara manipulada**, peso zerado, sequências de pesagens idênticas.
6. **Crachá emprestado** — mesma matrícula em duas balanças ao mesmo tempo.
7. **Pesagem fora do turno** do funcionário (cruzar com o relógio de ponto).

O sistema precisa nascer com o item 1 no horizonte. Overlay é a Fase 1;
reconciliação é a fase que paga a conta.

---

## 3. Arquitetura

```
  [Crachá RFID]                     [Balança etiquetadora]
        │                                     │
        │ tag                                 │ transação (SKU, peso, R$)
        ▼                                     ▼
  ┌──────────────────────────────────────────────────┐
  │  EDGE (1 por setor: açougue, padaria, hortifruti)│
  │  agent-rfid · agent-balanca · correlator         │
  └───────────────┬──────────────────────────┬───────┘
                  │ texto (TCP)              │ evento normalizado
                  ▼                          ▼
        ┌──────────────────┐        ┌──────────────────────┐
        │ Gravador/câmera  │        │  API central          │
        │ Intelbras (POS)  │        │  eventos · regras     │
        │ overlay + índice │        │  evidência · alertas  │
        └──────────────────┘        └──────────┬───────────┘
                  │ RTSP                       │
                  └────────► clipe de evidência│
                                               ▼
                                        Painel web
                              (timeline · busca · vídeo · perdas)
```

### 3.1 Camadas

| Serviço | Responsabilidade |
|---|---|
| `agent-rfid` | Lê o crachá, publica `operador.identificado` |
| `agent-balanca` | Driver por fabricante; normaliza para um evento canônico |
| `correlator` | Mantém a *sessão de operador* na balança e casa RFID × pesagem |
| `overlay-cftv` | Adapter para POS (TCP), CGI da câmera ou player próprio |
| `evidencia` | Puxa RTSP, grava clipe curto, calcula SHA-256, arquiva |
| `regras` | Motor antifraude (seção 2) |
| `web` | Painel, timeline, busca por operador/produto/período |

### 3.2 Sessão de operador

Regra simples e auditável: um crachá aproximado **abre** sessão na
balança e ela vale até (a) outro crachá, (b) *timeout* de inatividade
configurável, (c) fim de turno. Pesagem fora de sessão é evento próprio
(`operacao_sem_identificacao`), não é descartada.

---

## 4. Integração com a Intelbras

### 4.1 Caminho principal — função POS do gravador/câmera

Os gravadores Intelbras (linha NVD/MHDX) e câmeras de linhas recentes têm
a função **POS/PDV**: recebem os dados de uma transação por rede,
sobrepõem o texto na imagem **gravada** e associam o evento à gravação,
permitindo busca depois. Parâmetros de configuração observados: IP de
origem, IP e porta de destino e *tempo de exibição* (segundos que o texto
permanece na tela).

É o caminho barato e oficial. **A validar antes de comprar**: modelo e
versão de firmware exatos, formato do payload aceito, delimitadores de
início/fim de transação e limite de linhas/caracteres.

### 4.2 Caminho alternativo — CGI da câmera

As câmeras Intelbras expõem uma API HTTP compatível com o padrão Dahua.
O texto sobreposto é escrito direto no *widget* de vídeo:

```
GET /cgi-bin/configManager.cgi?action=setConfig
    &VideoWidget[0].CustomTitle[1].EncodeBlend=true
    &VideoWidget[0].CustomTitle[1].Text=JOAO|CARNE%20BOVINA|1,000%20kg|R$%2010,99
```

Quatro linhas por título usando `|` como quebra; existem os títulos 0–3.
Pegadinhas conhecidas: espaço precisa de *encoding*, o limite de
caracteres é curto e cada atualização é uma requisição HTTP (latência e
carga na câmera). Serve como plano B e para câmeras sem função POS.

### 4.3 Caminho premium — evidência própria

Em paralelo ao overlay, o serviço `evidencia` puxa o RTSP da câmera e
grava um clipe de 10–20 s por transação, com *hash*. O texto **não é
queimado**: ele é renderizado sobre o vídeo no player do painel, a partir
do evento persistido.

Vantagens: o vídeo original fica íntegro (vale mais como prova), o
overlay é pesquisável e reordenável, e — importante para a LGPD — nada
de dado pessoal fica gravado dentro do arquivo de vídeo.

**Recomendação:** fazer os dois. POS no gravador para efeito inibidor e
para quem só vai olhar o CFTV; evidência própria para a auditoria.

---

## 5. Balanças

### 5.1 Com RFID de fábrica

**Toledo Prix 5 Plus com leitor RFID** (32 kg) — leitor integrado com
pulseira/crachá para controle de operador, vendida exatamente com o
argumento de identificação individual e redução de fraude em
supermercado, açougue, padaria e hortifruti. É o encaixe perfeito: sem
caixa extra na bancada, sem adaptação, e o operador já entra na
transação registrada pela própria balança.

É a escolha padrão para loja nova ou troca de parque.

### 5.2 Quadro comparativo

| Fabricante | Modelo | RFID de fábrica | Rede | Nota |
|---|---|---|---|---|
| Toledo | **Prix 5 Plus c/ leitor RFID** | **Sim** | Ethernet / Wi-Fi | Primeira opção |
| Toledo | Prix 6 | A confirmar | Ethernet / Wi-Fi | Linux, touch, linha topo |
| Toledo | **Prix 5** | Não | Ethernet / Wi-Fi | **Já em uso num mercado do piloto** — serve para tudo menos o RFID (ver §5.6) |
| Toledo | Prix 4 Uno / Due | Não | Ethernet / Wi-Fi | Base instalada enorme — alvo de *retrofit* |
| Urano | BA37 / BA37C | Não confirmado | Wi-Fi / Ethernet | Urano Integra tem *status monitor* e API |
| Urano | Topmax-SS Plus / B40 | Não confirmado | Wi-Fi / Ethernet | Linha atual |
| Filizola | Platina / Aliance | Não | Rede / serial | Base grande, integração menos documentada |
| Micheletti / Balmak / Welmy | diversos | Não | varia | Baixa prioridade |
| DIGI / Bizerba / Mettler | linha premium | Alguns com login por crachá | Rede | Redes grandes, custo alto |

### 5.3 Retrofit — a balança que o cliente já tem

Para o parque instalado (que na prática é Prix 4 e Filizola), o leitor
RFID vai no *edge*, não na balança:

- Leitor **MIFARE 13,56 MHz** (preferir DESFire/EV2 — cartão 125 kHz
  EM4100 é clonável por R$ 30 e destrói a premissa antifraude).
- Conexão USB-HID (emula teclado, plug and play) ou PN532/RC522 via SPI
  num Raspberry Pi.
- Se a loja já usa controle de acesso Intelbras, o mesmo crachá pode
  servir — desde que seja MIFARE, não proximidade 125 kHz.

### 5.4 A Prix 5 comum serve?

Sim, para quase tudo. A Prix 5 tem Ethernet/Wi-Fi e está coberta pelo
MGV6/MGV7, que é de onde sai a transação com operador, peso e valor — ou
seja, a **fonte de dados do sistema está atendida**. O que falta nela é
só o leitor RFID de fábrica, que é exclusivo da variante **Prix 5 Plus
com leitor RFID**.

Para uma loja que já tem Prix 5 instalada, o caminho é o *retrofit* de
§5.3: leitor RFID externo no *edge*, ao lado da balança. Custa uma
fração de trocar a balança e não mexe no equipamento homologado do
cliente — o que, para venda de SaaS, é uma vantagem e não um remendo.

**A confirmar** (pergunta A6 em [`perguntas-toledo.md`](./perguntas-toledo.md)):
se a Toledo oferece kit de adaptação de RFID para Prix 5 em campo. Se
oferecer, é o melhor dos dois mundos.

Alternativa que **não** recomendo: o login do operador por código
numérico que a balança já tem. Código se empresta, se anota no balcão e
se digita pelo colega — a rastreabilidade vira ficção justamente no
sistema cujo propósito é rastrear.

### 5.5 Fonte dos dados de pesagem

**Toledo (MGV6/MGV7):** cadastra até 500 operadores na própria balança e
registra transação, peso, quantidade e valor acumulado **por operador**.
Integra por arquivo-texto padrão (ex.: `Opecad.txt` para o cadastro de
operadores) e por web service/API, com carga manual, agendada ou
automática. É a fonte natural do nosso evento.

**Urano (Integra):** monitoramento em tempo real de conectividade e
atualização de dados na rede, integração por API.

**Filizola:** rede/serial, integração a levantar com o fabricante.

### 5.6 O risco número um: latência

A "coleta de vendas" dos softwares de gerenciamento é pensada para
**lote** (agendada), não para *streaming*. O overlay ao vivo precisa de
menos de ~2 s. Três saídas, em ordem de preferência:

1. **Protocolo/SDK de tempo real do fabricante.** Pedir formalmente a
   Toledo e Urano. Existe integração por web service; falta confirmar se
   há *push* por transação.
2. **Polling agressivo** do log de transações da balança (1–3 s). Mede-se
   o impacto na balança e na rede no PoC.
3. **Degradação controlada (fallback).** O RFID é instantâneo: o nome do
   operador entra na tela no momento do crachá. Os dados do produto
   chegam alguns segundos depois e (a) entram no overlay atrasados e
   (b) são gravados no evento, ficando corretos no player e na busca.
   Isso já entrega quase todo o valor antifraude, porque a auditoria é
   feita no painel, não olhando a tela ao vivo.

**Este é o item que o PoC existe para responder.** Nenhuma compra de
parque de balanças antes dele.

---

## 6. LGPD e direito do trabalho

Decisões que não devem ser desfeitas depois:

- **CPF não vai no vídeo.** Overlay mostra matrícula + primeiro nome. O
  CPF fica no registro do evento, com acesso por perfil e log de quem
  consultou. Queimar CPF em vídeo que será retido, copiado e às vezes
  compartilhado é minimização de dados jogada fora — e é irreversível.
- **Monitoramento ostensivo.** Aviso visível na área, comunicação escrita
  aos funcionários, política assinada, câmera nunca oculta. Monitoramento
  velado é o que a Justiça do Trabalho pune, não a câmera em si.
- **Base legal:** legítimo interesse (segurança patrimonial) com teste de
  proporcionalidade documentado. Vale conversar com o jurídico do cliente
  e, quando houver, checar o acordo coletivo da categoria.
- **Enquadramento** fechado na bancada e no display da balança. Nunca
  vestiário, banheiro ou área de descanso.
- **Retenção definida** (30–90 dias conforme o cliente), expurgo
  automático, e **auditoria de acesso**: quem assistiu qual clipe e
  quando.
- O crachá RFID identifica pessoa e produz perfil de produtividade —
  isso entra no aviso e no registro de operações de tratamento.

---

## 7. Fases

| Fase | Duração | Entrega | Critério de aceite |
|---|---|---|---|
| **0 — PoC** | 2–3 sem | 1 balança + 1 câmera numa bancada | Crachá → nome na tela em < 1 s; pesagem → produto/peso/valor na tela e na gravação; **latência medida e registrada** |
| **1 — MVP** | 4–6 sem | Correlator, evento persistido, clipe de evidência, painel com busca | 1 loja, 3 balanças, 7 dias sem perda de evento |
| **2 — Antifraude** | 4–6 sem | Conciliação etiqueta × NFC-e, posto de estorno, motor de regras, alertas, relatório de perda por operador/setor — detalhado em [`antifraude-conciliacao-etiquetas.md`](./antifraude-conciliacao-etiquetas.md) | Detectar os casos 1–4 da seção 2 em dados reais |
| **3 — Escala** | 6–8 sem | Multi-loja, RBAC, retenção/auditoria LGPD, provisionamento e monitoramento do *edge* | Instalar uma loja nova sem engenheiro no local |
| **4 — Visão** *(opcional)* | — | Verificar por imagem que há produto na bandeja; detectar bandeja vazia com etiqueta emitida | — |

A Fase 0 é curta de propósito: ela existe para matar ou confirmar duas
incógnitas (latência da balança, função POS do modelo de câmera). Se
qualquer das duas falhar, o desenho muda antes de custar dinheiro.

---

## 8. Hardware por bancada (estimativa)

| Item | Observação |
|---|---|
| Balança etiquetadora com RFID | Toledo Prix 5 Plus c/ leitor — ou balança atual + leitor externo |
| Câmera IP Intelbras | Linha VIP, plano fechado sobre bandeja + display, PoE |
| Gravador Intelbras com função POS | NVD compatível, dimensionado por nº de canais |
| *Edge* | Mini-PC x86 (preferível — driver serial/USB, disco) ou Raspberry Pi 5 |
| Leitor RFID externo | Só no *retrofit*; MIFARE DESFire |
| Iluminação | Bancada de açougue costuma ter contraluz e reflexo em inox — subestimar isso custa um retorno técnico |

Custos não foram levantados: dependem de negociação com integrador
Toledo/Intelbras e do número de bancadas. Deve ser feito junto do PoC.

---

## 9. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Balança não emite transação em tempo real | Alto | Fallback da seção 5.5; validar no PoC antes de qualquer compra |
| Modelo/firmware Intelbras sem função POS | Médio | Confirmar modelo exato; CGI como plano B; evidência própria como plano C |
| Fabricante não abre protocolo | Alto | Contato comercial formal com Toledo e Urano na semana 1 |
| Fraude migra para o caixa | Alto | Fase 2 (reconciliação) não é opcional |
| Resistência sindical/jurídica | Médio | Seção 6 desde o início, não como remendo |
| Rede da loja instável | Médio | *Edge* com fila local e reenvio; nunca perder evento por falta de rede |

---

## 10. Relação com o my Home / Norty

É **outro produto**, com outro domínio (loja, operador, SKU, pesagem) e
outro comprador. Não deve entrar em `packages/shared` do my Home — a
regra 1 do `CLAUDE.md` existe justamente para o domínio não virar um
depósito.

O que se reaproveita é o **método**, e ele se aplica inteiro:

1. Domínio e contratos num pacote compartilhado próprio.
2. Uma única matriz RBAC protegendo menu e rota.
3. Todo dado escopado por loja (o `condominiumId` vira `lojaId`),
   resolvido no guard, nunca vindo do corpo da requisição.
4. Regra que não pode ser burlada vive no banco (`@@unique` em
   `(balancaId, sequencialTransacao)`, por exemplo).
5. Dinheiro em `Decimal(12,2)`.
6. Estilo por *tokens*.

Stack sugerida: a mesma — NestJS + Prisma + PostgreSQL na API, React +
Vite no painel, TypeScript ponta a ponta, mais os agentes de *edge*
(Node ou Go).

---

## 11. Perguntas em aberto

1. Qual fabricante e modelo de balança predominam no cliente piloto?
   (define retrofit × troca de parque)
2. Já existe CFTV Intelbras no piloto? Qual gravador e qual firmware?
3. Quantas bancadas por loja no perfil de cliente alvo?

Respondidas: é **SaaS para o varejo**, sem parque instalado — o que torna
o *retrofit* (§5.3) obrigatório, não opcional, porque o produto tem de
entrar em loja que já tem balança. A fonte do caixa é a **NFC-e/SAT**,
não a integração com cada PDV — ver §3 do documento de conciliação.

---

## Fontes

- Função POS em gravadores Intelbras — [Fórum Intelbras](https://forum.intelbras.com.br/viewtopic.php?t=67072), [Manual NVD 3316/3332](https://backend.intelbras.com/sites/default/files/2023-05/Manual_NVD_3316_3332_01-23_site_0.pdf), [Ativar POS em câmeras Intelbras](https://help.market.com.br/frente/ativar-pos-em-cameras-intelbra.htm)
- API CGI de texto sobreposto (padrão Dahua) — [Dahua OSD / overlay text (Node-RED)](https://discourse.nodered.org/t/dahua-osd-overlay-text/39652), [cliente Dahua](https://github.com/rroller/dahua/blob/main/custom_components/dahua/client.py)
- Balança com leitor RFID — [Toledo Prix 5 Plus 32 kg com leitor RFID](https://www.digimaqautomacao.com.br/automacao/balanca-toledo-prix-v-com-leitor-frid)
- Gerenciamento e transações por operador — [Toledo MGV7](https://www.toledobrasil.com/softwares-e-drivers/automacao/mgv7/), [Toledo MGV6](https://help.toledobrasil.com/mgv6/v1_6_/Html_Pages/solucoesmgv6.html)
- Balanças em rede — [Toledo Prix 5 Ethernet/Wi-Fi](https://casamagalhaes.com.br/equipamento/balanca-digital-32kg-prix-5-toledo-wifi/), [Urano BA37](https://www.pontoautomacao.com.br/balanca-etiquetadora-digital-ba37-urano), [Urano B40](https://www.urano.com.br/balanca-etiquetadora-b40/)
