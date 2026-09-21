# 13 — Carteira de clientes e atendimento em campo

O Desk deixa de ser só a central interna da Norty e passa a atender a
**carteira de clientes** dela. Este documento registra as decisões
tomadas em 21/09/2026 e o que cada uma implica.

---

## 1. A carteira: cliente dentro da Norty

**Decisão:** a empresa-cliente é uma entidade **dentro** da organização
Norty, não uma organização separada.

A alternativa era fazer de cada cliente uma organização e dar ao técnico
acesso a várias — que é a árvore recursiva de entidades do GLPI, a que
`docs/02-gap-analysis.md` decidiu não copiar. Ela exigiria refazer o
`JwtAuthGuard`, o escopo de leitura e toda consulta do sistema, para
ganhar um isolamento que o escopo de leitura já sabe dar.

Como fica:

- `Client` (empresa-cliente) pertence à organização Norty: nome,
  documento, domínio de e-mail, contato, ativo.
- `Ticket.clientId` diz de quem é o chamado.
- Todo `where` continua começando por `organizationId` — a regra 3 do
  `CLAUDE.md` não muda. O cliente é uma **segunda** dimensão do escopo.
- Quem é do cliente enxerga só o próprio cliente. Quem é da Norty
  enxerga a carteira inteira. Isso vive em `escopoDeLeitura`, onde já
  mora a regra equivalente para agente e solicitante.

**O que não pode acontecer:** um chamado de um cliente aparecer para
outro. É teste de ponta a ponta obrigatório, não conferência de tela.

## 2. O usuário do cliente

A Norty cadastra a empresa e, dentro dela, as pessoas. De cada pessoa
pede-se **nome completo, e-mail e WhatsApp**; o login sai disso:

```
Yuri Souza Goes  +  empresadojoao.com.br  →  yuri.goes@empresadojoao.com.br
```

Primeiro nome e último sobrenome, sem acento, em minúsculas. Partículas
("de", "da", "dos") não contam como sobrenome. Homônimo ganha sufixo
numérico (`yuri.goes2@`), porque duas pessoas com o mesmo nome numa
empresa de cem é questão de tempo.

**Senha: PIN de 6 dígitos.** Decisão do Yuri, depois de eu levantar que
4 dígitos são dez mil combinações para um portal que mostra os chamados
da empresa. Seis são um milhão, continua fácil de decorar e digitar no
celular. Guardado com Argon2id, como qualquer senha daqui.

Mitigações obrigatórias, porque PIN curto sem elas é senha fraca com
outro nome:

- Bloqueio progressivo por conta **e** por IP depois de 5 erros.
- O login continua com a mesma mensagem para conta inexistente e PIN
  errado, e o caminho da conta inexistente paga o mesmo custo de
  verificação — senão o relógio conta o que a mensagem esconde.
- Toda tentativa entra na auditoria.

## 3. Tipo de chamado e grupo

`TicketType` por organização, com roteamento: o tipo aponta para um
**grupo** (time) ou para uma **pessoa**, e o chamado aberto com aquele
tipo já nasce atribuído.

Na abertura, o solicitante escolhe o tipo e pode indicar
**observadores** — o papel `OBSERVADOR` já existe em `TicketActor`,
faltava a tela.

## 4. Agendamento de atendimento

O técnico marca data e hora do atendimento. Enquanto o chamado espera
essa data, **o relógio do SLA não corre** — e o indicador não conta a
espera como violação.

Isso não é mecanismo novo: é a pausa que o chamado pendente já usa, que
desconta tempo útil. O agendamento vira uma pausa com data de volta
conhecida. Assim o número do SLA continua medindo o que a Norty
controla, que é o que um indicador serve para medir.

## 5. Consulta pública por protocolo

Na tela de abertura rápida (sem login), um campo de protocolo abre a
**linha do tempo somente leitura** e permite baixar o PDF da Norty.

Quem consulta não escreve nada. O protocolo é a credencial, então ele
não pode ser adivinhável: número sequencial não serve. O protocolo de
consulta é um código aleatório por chamado, separado do número.

## 6. Ordem de serviço

Aba própria no chamado, para o que é feito em campo:

- Itens a realizar, com o que foi executado.
- PDF da Norty, baixável.
- Ao finalizar pelo celular, o técnico **assina desenhando** na tela; a
  assinatura vira imagem e entra no PDF.
- **Carimbo visual da Norty** no rodapé: nome, documento, data e o
  código de verificação do protocolo.

**Decisão:** carimbo visual, não assinatura criptográfica. O certificado
A1 (PAdES) fica para quando houver necessidade jurídica — e aí precisa
do `.pfx`, que nunca entra no repositório, e da senha como segredo.
Enquanto isso, o carimbo com código de verificação já resolve a
pergunta "este documento é mesmo da Norty?".


---

## 7. O que foi entregue, e o que mudou pelo caminho

Registrado em 21/09/2026, depois dos seis blocos.

### Diferenças entre o planejado e o feito

**Bloqueio depois de 5 erros → depois de 3.** A seção 2 dizia cinco. A
escada implementada dá **três** erros de folga e tranca a partir do
quarto, com espera crescente até uma hora. Três porque digitar errado
duas vezes é comum e cinco tentativas livres contra um PIN de seis
dígitos ainda é generoso demais; a conta que importa é a de mil
tentativas custarem mais de um dia.

**O agendamento não é a pausa de pendência.** A seção 4 dizia que a
visita marcada viraria "uma pausa com data de volta conhecida",
reusando `pausedSeconds`. Não foi. O prazo de resolução é empurrado até
o fim da visita e o quanto ele andou fica em `postponedSeconds`, coluna
própria. Duas razões:

1. Somadas numa coluna só, esperar o cliente responder e esperar a data
   marcada com ele ficam indistinguíveis — e o relatório perde a
   resposta para "por que este prazo esticou".
2. A pausa desconta tempo **corrido em expediente**; a visita marcada é
   um **instante**. O fim de uma visita pode cair fora do expediente, e
   aí recuar a mesma quantidade de segundos úteis não devolve o instante
   de onde se saiu. Por isso o agendamento guarda o vencimento anterior
   e o cancelamento o restaura.

**Só o TTR anda.** Não estava dito, e precisa estar: o TTO é "a gente
voltou a falar com você", e marcar visita não é desculpa para não ter
voltado a falar. Esticar os dois faria o primeiro atendimento parecer no
prazo num chamado que ficou dois dias mudo.

**O protocolo tem alfabeto próprio.** A seção 5 pedia "código aleatório".
São oito caracteres de um alfabeto de 23 sem `O`/`0`, `1`/`I`/`L`,
`5`/`S`, `B`/`8` e sem vogal — o código é ditado ao telefone e copiado
do papel. Dá 23^8 ≈ 7,8·10^10.

### O que o carimbo precisou para valer

A seção 6 pedia carimbo com código de verificação. Sozinho ele seria
enfeite: para o código responder "isto é mesmo da Norty?", a consulta
pública passou a listar as ordens **concluídas** do chamado, com número,
data e quem assinou. Quem tem o papel na mão digita o protocolo e
confere.

### A abertura sem login — entregue em 21/09/2026

A seção 5 pressupunha "a tela de abertura rápida (sem login)", que não
existia. Existe agora, em `/abrir`, e as duas perguntas que estavam em
aberto foram respondidas assim:

**Quem é o requerente.** Um `Contact`, como no e-mail e no WhatsApp —
não um usuário. Quem abre informa nome e ao menos uma forma de retorno
(e-mail ou WhatsApp); a segunda abertura da mesma pessoa reaproveita o
contato. O requerente ser contato e não usuário é o que distingue
estruturalmente um chamado aberto de fora.

**Como conter abuso.** A mesma escada de bloqueio por IP da consulta
por protocolo, com uma diferença: a busca que **não acha** conta como
erro. É a busca que não acha que o varredor repete.

**Como a empresa é identificada.** Nome ou documento, no mesmo campo, e
o sistema decide qual é pela forma: onze ou quatorze dígitos sem letra
é documento; o resto é nome.

- *Documento* é exato, sobre uma coluna gerada que guarda só os
  dígitos — com ou sem pontuação, dos dois lados. Um dígito trocado não
  acha nada, de propósito.
- *Nome* é `word_similarity` de trigramas sobre uma coluna gerada
  normalizada (minúsculas, sem acento, sem forma societária no fim),
  com limiar de 0,5.

Três decisões que só apareceram medindo:

1. `word_similarity` em vez de `similarity`: a segunda compara com o
   nome inteiro e afunda consulta curta ("empresa" dá 0,19 contra
   "Empresa do João Comércio de Materiais LTDA"; a primeira dá 1,0).
2. Tirar a forma societária dos dois lados: sem isso "xyz ltda" casava
   0,556 com a carteira inteira.
3. O limiar precisa de `SET LOCAL` em transação — num CTE ao lado do
   `SELECT` a ordem de avaliação não é garantida, e vale o padrão 0,6
   do Postgres. O sintoma é a busca perder a faixa 0,5–0,6 em silêncio.

**A escolha da empresa é sempre da pessoa, nunca do sistema.** A tela
mostra até cinco nomes parecidos e quem abre aponta o seu. Escolher
sozinho pelo mais parecido poria o chamado na empresa errada sem
ninguém perceber — num sistema de chamados, isso é o cliente A lendo o
problema do cliente B.

**O que sai desta porta é o mínimo:** id e nome. Nem documento, nem
contato, nem contagem de chamados. Quem digita três letras não provou
ser ninguém.

### O que ainda falta

Nada dos seis blocos. Continuam pendentes, fora deles, o arquivo do
logo do Norty Desk e as duas capturas do LICITA+ — sem elas a marca nos
PDFs é o texto "norty desk" desenhado, e o alinhamento com o LICITA+ se
apoia só nos tokens.
