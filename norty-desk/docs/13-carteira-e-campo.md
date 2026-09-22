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

---

## 8. Modelos, e como se chega na máquina

Registrado em 21/09/2026.

### Modelo de chamado é o formulário dinâmico, visto do outro lado

Deduzido da categoria, ele é "o formulário que aparece sozinho";
escolhido pelo nome, é "o botão Impressora que carrega as perguntas
certas". `TicketForm` ganhou `isModel`, `description`, `position` e
`isPublic` em vez de nascer um terceiro conceito — duas tabelas para
isso seriam dois construtores de campo e dois validadores para a mesma
pergunta.

As marcas são separadas porque respondem a coisas diferentes:

- `isModel` — aparece na lista de quem vai abrir. Um formulário que
  existe só para herdar numa subcategoria não deve poluí-la.
- `isPublic` — vale também sem login. Um modelo com campo interno
  ("custo estimado", "contrato") não pode aparecer para quem só quer
  dizer que a impressora parou.

`Category.isPublic` segue a mesma lógica e nasce `false`: a taxonomia
interna tem ramo que não se mostra a estranho, e um padrão que
publicasse tudo faria de cada categoria nova um vazamento que ninguém
decidiu.

### Acesso remoto: a decisão que precisa estar escrita

O equipamento passa a guardar Tailscale, dados de VPN e o id **e a
senha** do acesso remoto. É a informação mais perigosa do sistema: com
ela, quem a tiver entra na máquina de alguém.

**Decisão:** guardar, cifrado, com três cercas.

1. **Cifrada em repouso** (AES-256-GCM, a mesma dos segredos de canal).
   Em texto claro, um dump do banco entrega o parque inteiro.
2. **Fora de toda carga.** Nem listagem, nem detalhe, nem os ativos do
   chamado, nem a própria rota de acesso remoto — que devolve
   `temSenha: true` e nada mais. Sai por uma rota que existe só para
   isso, e que é `POST`: revelar é um ato, não uma leitura, e `GET`
   deixaria cópia no histórico do navegador e no log do proxy.
3. **Cada revelação na auditoria**, com quem, qual máquina e quando. O
   diff registra `temSenha` mudando, nunca o valor — trilha que guarda
   segredo é um segundo lugar de onde ele vaza, e esse não é cifrado.

`ativo:acesso-remoto` é permissão própria: "que máquina é essa" é
inventário, "como eu entro nela agora" é chave de casa. Agente,
supervisor e administrador têm; o gestor que lê indicador e o cliente,
não.

**O que isto não é.** Não é cofre de senhas. Não há rotação, não há
compartilhamento com validade, não há segredo por pessoa. É o lugar
certo para a senha do AnyDesk da máquina do cliente, e o lugar errado
para a senha do administrador de domínio — essa pede um cofre de
verdade, e o Desk não é um.

**A chave mora em `CHANNEL_SECRET_KEY`**, que já cifra segredos de
canal, chaves de licença e fontes de diretório. O nome ficou pequeno
para o que ela protege hoje; renomeá-la quebraria a instalação que está
rodando, então fica anotado aqui em vez de ser trocado em silêncio.

### O agente do Norty Endpoint

O pedido mencionava alimentar estes campos pelo agente do endpoint. Os
campos existem e a API que os grava também (`PATCH
/assets/:id/acesso-remoto`), então o agente tem onde escrever quando
existir. O que **não** foi feito, e é decisão de produto em aberto: como
o agente se autentica para escrever. Chave de aplicação por máquina,
chave por organização e certificado de cliente resolvem de jeitos
diferentes, e nenhum deles deve ser escolhido sem saber como o agente
vai ser distribuído.

## 9. A tela de configuração dos modelos

Uma tela, não duas. Modelo e formulário são o mesmo `TicketForm`: a
diferença é a marca `isModel`, que decide se ele é escolhido a dedo na
abertura ou se só chega pela categoria. Duas telas mexendo na mesma
tabela fariam alguém editar o "modelo" num lugar e não entender por que
o "formulário" mudou no outro — então `/config/formularios` virou
`/config/modelos-de-chamado`, e o endereço antigo redireciona para ele.

A coluna **Onde aparece** existe porque a pergunta que a tabela precisa
responder de relance é essa: `modelo` quando é oferecido na abertura,
`sem login` quando também vale na tela pública, e "Só pela categoria"
quando nenhuma das duas. Sem ela, "por que este não aparece na abertura?"
só se responde abrindo a ficha.

Na barra lateral, "Modelos" sozinho ao lado de "Modelos de chamado" não
dizia qual era qual: os textos prontos de resposta passaram a se chamar
**Modelos de resposta**.

### O campo interno e a porta sem login

`isPublic` marca a ficha inteira, e por isso não bastava. O caso real é
o modelo que **deve** mesmo ser público e tem um campo interno — "custo
estimado do reparo", "número do contrato". A tela escondia esse campo,
mas a API mandava o schema inteiro: o rótulo ia no JSON que o navegador
de quem não fez login recebe, contando ao visitante o que a empresa
controla por dentro. Esconder o campo era conveniência sem guard
(CLAUDE.md, regra 2).

`schemaSemInternos` (em `packages/shared`) recorta, e as duas pontas da
API o usam: ao **responder** a lista de modelos públicos, e ao
**validar** a abertura — assim responder a um campo interno vira "chave
desconhecida", que é o que ela é nessa porta. O aplicativo usa a mesma
função para desenhar.

Fica registrado o limite: o resto do formulário público é visível para
qualquer pessoa com o endereço. Pergunta cuja *existência* já diz algo
sobre a empresa tem de ser marcada como interna — é isso que o texto de
ajuda da tela diz, em vez de prometer sigilo que a porta não tem.

## 10. Destino do modelo e aprovação pela categoria

### Para quem vai o chamado

Duas fontes dizem o destino e podem discordar. A **categoria**
classifica ("Hardware vai para a Infra"); o **modelo escolhido** é uma
afirmação mais específica ("Troca de toner vai para o Suporte"), e por
isso vence — inteira, não campo a campo. Se o modelo nomeia um time e a
categoria nomeia uma pessoa, vale o time do modelo: quem montou o
modelo sabia da categoria e decidiu diferente. Dentro de cada fonte, a
pessoa vence o time.

O modelo só entra nessa conta quando foi **escolhido**. Formulário que
veio por herança da categoria não redireciona nada — senão o formulário
padrão da organização, que vale onde não há outro, passaria a rotear
todo chamado da casa para um lugar só.

A regra é `destinoDoChamado` em `packages/shared`, função pura, testada
sem banco. As três portas de abertura leem a mesma.

**`formId` passou a ser aceito na abertura com login.** Havia a decisão
contrária, pelo receio de alguém responder ao schema de um formulário e
gravar o resultado no chamado de outro. O receio é legítimo e a resposta
não é recusar o campo: é validar contra o **mesmo** formulário que vai
ser gravado, que é o que a abertura sem login já fazia. A API ainda
exige `isModel` — ficha que existe só para herdar não é item de menu.

### Aprovação exigida pela categoria

A marca fica na categoria e **herda pela árvore**: marcar "Compras" vale
para "Compras > Licenças" sem remarcar cada filha.

O chamado **abre normalmente**. Não vai para `EM_APROVACAO`, não espera
numa antessala: quem pediu já tem protocolo e a fila já enxerga o
chamado. O que a marca faz é criar a decisão, para que ela exista e
fique registrada.

**Quem decide** é o gestor cadastrado *naquela empresa* — os `GESTOR`
cujo `Membership` aponta para o mesmo cliente do requerente — mais os
administradores, que sempre podem. Quórum 1: o primeiro que decidir
resolve, porque gestor de férias não pode parar um pedido.

O `Membership` carrega papel **e** empresa na mesma linha, e é por isso
que "gestor daquela empresa" é uma consulta e não uma estrutura nova.

**O requerente sai da lista.** Gestor aprovando o próprio pedido esvazia
a alçada. Quando isso esvazia a lista inteira, o chamado segue sem aval
e a razão fica escrita na linha do tempo — criar aprovação sem aprovador
produziria um chamado travado num pedido que ninguém pode decidir.

### Duas lacunas que apareceram no caminho

**`Category.isPublic` não tinha controle na tela.** Dava para marcar no
banco e não pela configuração, e era por isso que a instalação não tinha
nenhum tipo público para oferecer na abertura sem login. Entrou junto.

**A suíte ficou verde com o destino sendo descartado.** Os testes de
roteamento criavam o modelo direto no Prisma, então o contrato e a tela
tinham `defaultTeamId` e o DTO da API não — configurar pela tela não
gravava nada, e nenhum teste percebia. O buraco era testar a regra sem
testar a escrita. Hoje há um caso que passa pela rota (`POST /forms`,
`PATCH /forms/:id`) e confere que o chamado cai onde a tela prometeu.

## 11. Painel rápido, reconhecer a pessoa, e o `+55`

### Painel rápido

Os modelos viram blocos no topo de "Abrir chamado", e não numa tela
própria: clicar num bloco e continuar preenchendo ali é um passo; clicar
e navegar para outra tela é dois, pelo mesmo resultado.

Escolher o bloco carrega os campos daquele modelo e manda o `formId`
junto — o que traz de brinde o destino configurado nele. Clicar de novo
no mesmo bloco desfaz a escolha e devolve o formulário da categoria; sem
isso, a única saída seria recarregar a tela.

**O assunto não é pré-preenchido com o nome do modelo.** Seria cômodo de
escrever e deixaria a fila com dez chamados chamados "Impressora", que é
o mesmo que não ter assunto — quem tria precisa distinguir um do outro
pela linha, não abrir os dez. O que o modelo muda é o texto de exemplo
do campo.

### Reconhecer a pessoa na abertura sem login

Digitar o e-mail inteiro traz nome e WhatsApp; digitar o nome completo
traz e-mail e WhatsApp. **Só casamento exato, e no máximo uma pessoa.**

Prefixo foi recusado de propósito, e é a decisão que define esta rota:
com busca incremental, quem escolheu a empresa e digitou uma letra
receberia o catálogo de funcionários dela. É a mesma razão pela qual
observador se informa digitando o e-mail em vez de escolher numa lista.

Escopado ao cliente escolhido — gente de outra empresa não é reconhecida
por esta porta — e sob o mesmo acelerador das outras rotas públicas,
para que adivinhar e-mail um a um custe tempo.

**O que sobra, e fica escrito:** quem já sabe o e-mail exato de alguém
descobre o telefone dele. É o preço de preencher sozinho, e é o dado de
contato da própria empresa. Não é um vazamento em massa; é uma consulta
de um registro por quem já tem o identificador.

Preenche só o que está vazio. Sobrescrever o que a pessoa digitou à mão
é o defeito clássico do autopreenchimento: ela corrige o telefone, sai
do campo do nome, e o telefone volta ao antigo.

### O `+55` é trabalho do sistema

Ninguém escreve `+5511999999999` num formulário. Escreve
`(11) 99999-9999`, ou cola com o zero de tronco na frente. O canal, do
outro lado, só fala E.164 — e o número gravado num formato e procurado
noutro é contato duplicado e resposta que não chega.

`telefoneBrasileiro`, em `packages/shared`, resolve nas duas pontas: a
API grava normalizado em todas as fronteiras de escrita (carteira,
pessoas, minha conta, abertura sem login), e a tela mostra a máscara
enquanto se digita, dizendo embaixo o que vai ser gravado.

A decisão é por **comprimento**, não por prefixo, e é isso que resolve o
caso que a leitura ingênua erra: o DDD 55 existe — Santa Maria, no Rio
Grande do Sul. Quem só procura "começa com 55" para decidir se é código
de país engole o DDD e grava um número mutilado.

Número estrangeiro digitado com `+` volta como veio: quem escreveu
`+351` sabia o que fazia. Número sem DDD é recusado, em vez de gravado
quebrado para o WhatsApp rejeitar em silêncio semanas depois.
