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

**O que isto não é.** Não é cofre de senhas: não há compartilhamento
com validade nem registro de quem leu. É o lugar certo para a senha do
AnyDesk da máquina do cliente.

> **Atualizado (seção 18).** A frase original terminava em "essa pede um
> cofre de verdade, e o Desk não é um". Deixou de ser verdade: o cofre
> existe, com chave própria, concessão com prazo e registro de cada
> leitura. Os campos de acesso remoto **continuam** como estão — são a
> resposta rápida na tela do equipamento, e não o cofre.

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

## 12. A demonstração passa a demonstrar

O `DEMO=1 npm run db:seed` produzia uma instalação onde três coisas
construídas nesta fase **não eram demonstráveis**: a carteira, a
abertura sem login e a aprovação por categoria. Todas dependem de
empresa-cliente, de gente atrelada a ela e de um gestor daquela empresa,
e o seed não criava nenhum dos três. Só funcionavam em banco onde alguém
já tinha criado os dados à mão — que era o meu, e não o de quem clona o
repositório.

Agora a demonstração semeia uma empresa com CNPJ e domínio, duas pessoas
dela (uma cliente, uma **gestora**, que é quem decide as aprovações),
uma categoria "Compras" que exige aval, três categorias públicas e três
modelos de chamado com destino.

**O PIN não é `123456`.** `pinFraco` recusa sequência, e é a mesma
função que a tela usa: um seed que grava o que a aplicação recusaria
produziria uma demonstração que não se consegue repetir pela tela. É
`426913`, e o seed o imprime ao terminar, junto dos dois logins.

Os logins das pessoas da empresa não são escritos no seed: saem de
`loginDoCliente(nome, dominio)`, a mesma função da tela da carteira.
Escrevê-los à mão seria a primeira coisa a divergir quando a regra do
login mudasse.

Conferido do jeito que interessa: banco truncado, `DEMO=1` rodado duas
vezes (idempotente — um cliente, três modelos, sete usuários nas duas),
e os três fluxos percorridos no navegador contra esse banco limpo. A
busca acha a empresa por nome aproximado, o e-mail exato preenche nome e
WhatsApp já em E.164, o PIN entra, e o chamado em "Compras" nasce
`ATRIBUIDO`, com protocolo e com o aval pedido a duas pessoas: a gestora
da empresa e o administrador.

## 13. Integrador: token por empresa, e a pessoa de verdade

Metade já existia: `ApiKey` com SHA-256, escopos e revogação, e
`POST /v1/intake/tickets`. Faltavam as duas coisas que o Yuri pediu.

### A chave é da empresa

`ApiKey.clientId`. Nulo é a chave da casa — monitoramento, alerta — e
segue como era. Preenchido, **todo** chamado que entra por ela nasce
daquela empresa.

A cerca: o corpo da requisição não diz de que empresa o chamado é. Quem
tem o token diz por si. Um token vazado abre chamado na empresa dele, e
em nenhuma outra — com a empresa vindo do corpo, bastaria ler um id para
abrir chamado em nome de qualquer cliente da carteira.

### A pessoa do sistema de origem

O chamado sai no nome de quem pediu, não de uma "Integração" genérica
que ninguém consegue responder — e é disso que depende a pessoa enxergar
o próprio chamado quando entrar aqui.

**A identidade é o login da carteira.** `loginDoCliente(nome, domínio)`
é a mesma função da tela, e por isso a pessoa cadastrada pelo integrador
e a incluída à mão na carteira são o **mesmo** registro, não dois. O
e-mail que o sistema de origem manda serve para reconhecer quem já
existe; o login, para quem nasce.

**Nasce sem PIN.** Hash vazio não casa com nada, e a pessoa escolhe o
dela no primeiro acesso. Um integrador que criasse conta com senha
utilizável seria uma porta de entrada aberta por token — e é por isso
que `SEM_PIN` saiu de dentro do módulo da carteira para
`apps/api/common/pin.ts`: com uma constante em cada caminho, bastaria um
deles ganhar um valor "provisório" utilizável para abrir a porta que o
outro fechou.

Corrida entre dois chamados da mesma pessoa: o segundo encontra o login
já tomado e devolve quem o tomou, em vez de estourar.

### A tela que não existia

`ApiKey` não tinha tela nenhuma — só dava para criar chave pela API, o
que torna a integração inutilizável para quem opera. Agora há
**Integrações**, em Configuração.

O que ela precisa deixar claro, porque não tem conserto depois: o valor
da chave aparece **uma vez**. Por isso ele não vai num modal que se
fecha sem querer, e sim aberto na tela, com botão de copiar e a frase
dizendo que não aparece de novo.

Uma chave por sistema, e não uma para tudo: assim dá para revogar um sem
derrubar os outros, e a coluna "último uso" diz qual está parado — que é
a informação que falta na hora de decidir se pode revogar.

## 14. O índice de resoluções

Metade já existia: a base de conhecimento casava assunto e descrição do
chamado por índice de texto e oferecia artigos — recolhido por padrão,
"sugestão é oferta, não interrupção". O que faltava eram as duas coisas
que fazem disso um índice que **aprende**.

### Registrar a partir do chamado fechado

No chamado resolvido, um cartão pergunta "isto vai acontecer de novo?" e
abre o registro com o corpo **já preenchido** pela solução que quem
atendeu escreveu.

Página em branco no fim do atendimento é onde a base de conhecimento
morre: ninguém redige artigo depois de já ter resolvido o problema. O
texto vem pronto; o que se pede é ajustar o que é específico daquele
chamado — nome de pessoa, patrimônio.

A categoria vem do chamado, não da tela: foi quem atendeu que o
classificou, e deixar a tela mandar outra criaria divergência entre o
assunto do chamado e o da resolução dele.

O artigo guarda de qual chamado saiu (`sourceTicketId`), e é isso que
deixa a verificação dizer "já houve isto antes" em vez de "existe um
artigo parecido". A primeira é uma verificação proposta; a segunda é uma
lista que ninguém abre.

### A verificação, e o gesto que ensina

O componente deixou de listar e passou a afirmar: *isto já aconteceu, e
isto resolveu*, com quantos chamados aquela resolução fechou e um botão
— "foi isto" / "✓ resolveu".

**É a confirmação que faz o índice aprender.** `ArticleResolution` liga
resolução a chamado, e a ordem das verificações passa a ser por quantos
chamados cada uma resolveu, não só por casamento de texto. Texto
parecido não é a mesma coisa que solução que funcionou — e é essa
distinção que faz quem atende encontrar de cara o que costuma
funcionar.

A unicidade é `@@id([articleId, ticketId])`, no banco: dois cliques no
mesmo botão não contam duas vezes (CLAUDE.md, regra 4). Desconfirmar
existe porque marcar errado tem de ter volta.

Permissões diferentes de propósito: registrar resolução pede
`artigo:escrever` — é publicar o que a casa vai passar a recomendar.
Confirmar que resolveu pede só `chamado:responder`: quem atende é quem
sabe se resolveu, e exigir permissão de escrita afastaria justamente
quem tem a informação.

### Um defeito que o teste pegou

O `_count` era lido na criação do artigo, **antes** de a confirmação ser
gravada na mesma transação. A resposta saía dizendo que a resolução não
tinha resolvido nada — na própria tela de quem acabou de registrá-la.
Hoje o artigo é relido depois.

O `Sugestoes.tsx` foi apagado em vez de ficar ao lado do novo: dois
componentes fazendo a mesma coisa é como alguém conserta o errado.

## 15. Norty Copilot

A IA responde com pontuação e concordância certas, mas isso é o menor
dos problemas. Os dois que importam são: **o que sai da casa** e **quem
fica sabendo que foi IA**.

### O Copilot nunca responde sozinho

Duas intenções, e só estas duas: `REDIGIR` devolve um rascunho de
resposta; `SUGERIR` devolve o que verificar primeiro, para o técnico
ler. Nenhuma das duas escreve no chamado.

Não existe caminho em que uma resposta chegue ao cliente sem alguém ter
lido. É a diferença entre uma ferramenta que ajuda a escrever e uma que
fala pela empresa — e a segunda, mais cedo ou mais tarde, promete um
prazo que ninguém combinou.

A sugestão vai para um painel ao lado do campo, nunca para dentro dele.
Se caísse no campo, uma lista de hipóteses viraria resposta ao cliente
com um clique distraído.

### A cerca é uma consulta, não um filtro

Gemini e Groq são terceiros. Vai para lá o assunto, a descrição e as
**mensagens públicas** — o que o cliente já escreveu e o que a empresa
já respondeu a ele. Não vai:

- nota interna, que é conversa da equipe sobre o chamado;
- campo interno do formulário;
- dado de acesso: senha, IP de VPN, id de acesso remoto;
- identificador nenhum — de chamado, de pessoa ou de empresa.

O que não pode sair **não é carregado**: o `where` da consulta já exclui
o interno. Filtrar em memória deixaria o dado passar pelo processo, e um
`console.log` no lugar errado já o teria mandado para o log.

São duas barras, e cada uma vale sozinha. A visibilidade barra a
mensagem interna; o tipo barra o que é público mas não é fala de
ninguém — o nome de um anexo retirado, por exemplo, que é público e
conta o que o arquivo era (`demissoes-2026.pdf`). O teste prova as duas
separadamente, e foi preciso: a primeira versão dele gravava a nota pela
tela, que nasce `NOTA_INTERNA`, e por isso passava mesmo com o filtro de
visibilidade removido. Provava o filtro de tipo achando que provava o de
visibilidade.

### Quem recebe de fora é quem não tem como desconfiar

`TicketEvent.aiGenerated` é **coluna**, não chave no `payload`. O selo de
IA não pode depender de alguém lembrar de ler um JSON.

Da coluna saem as três declarações, da mesma verdade:

| Onde | O que aparece |
|---|---|
| Tela | selo `🤖 IA` ao lado do autor |
| E-mail | linha no rodapé, junto da assinatura |
| WhatsApp | linha no fim da mensagem |

O texto é um só, `MARCA_DE_IA` em `packages/shared/src/domain.ts`: *"🤖
Resposta gerada por IA (Norty Copilot) e enviada pelo atendimento."*
Duas redações seria a mesma promessa dita de dois jeitos, e uma delas
envelheceria.

Na caixa de resposta, a marca liga quando o rascunho entra e só desliga
quando o campo fica vazio — ou quando a pessoa clica em "reescrevi do
zero". Editar não apaga a marca. Medir "o quanto ainda é da IA" seria
adivinhação, e o erro seguro aqui é declarar demais.

### A chave, e o erro que o provedor devolve

Uma configuração por organização: provedor, modelo e chave. A chave é
cifrada com o mesmo AES-256-GCM dos segredos de canal
(`channels/segredos.ts`) e **nunca volta** para a tela — volta
`temChave: boolean`. Omitir a chave ao salvar mantém a guardada, para
que trocar de modelo não obrigue a redigitá-la; string vazia apaga.
Ligar sem chave é 400: botão que não responde é pior que botão nenhum,
e por isso a tela também pergunta antes de desenhar os botões.

O erro do provedor é classificado, não repassado. O Gemini devolve
**400** para chave inválida, não 401 — classificar pelo código HTTP
deixava "O Copilot devolveu erro 400" na tela, verdadeiro e inútil.
Hoje a razão é lida do corpo e vira frase em português: chave recusada,
modelo que não existe, limite de uso. O texto do provedor fica no log,
nunca na tela: é inglês, e no pior caso carrega a chave dentro da URL.

Ao contrário da transcrição de áudio, o Copilot **não degrada em
silêncio**. Lá a pessoa não pediu nada e o áudio segue anexado; aqui ela
clicou num botão e está esperando texto.

## 16. Avisos fora da aba

O pedido era chegar no Windows com o aplicativo em outra aba, ou fechado
— e valer também para o aplicativo nativo, quando ele existir.

É Web Push: o navegador entrega ao service worker, e o service worker
desenha o aviso no sistema. No Chrome e no Edge isso funciona com a
janela fechada, que é o caso que interessa. A carga vai **cifrada de
ponta a ponta com a chave do próprio aparelho** (RFC 8291): o serviço
de push do Google encaminha bytes que não consegue ler, e é por isso
que dá para mandar assunto de chamado por ali.

### Quem recebe — que é onde está o risco

E-mail mal endereçado a pessoa abre e fecha. Aviso mal endereçado
aparece na barra do Windows de quem estava numa reunião, com o assunto
do chamado à mostra, e não tem volta. A plateia é decidida por dois
eixos:

| Evento | Quem escreveu | Quem é avisado |
|---|---|---|
| interno | qualquer um | só quem atende (atribuído e time) |
| público | o cliente | quem atende |
| público | a casa | o solicitante e os observadores |

**Nota interna nunca chega a quem pediu o chamado** — nem ao
solicitante, nem a observador. A lista daquela linha é construída só com
quem atende, e é por isso que `quemAtende` não recebe um parâmetro
"incluir o solicitante": a cerca tem de ser estrutural, não uma opção
que alguém pode passar errado um dia.

**Ninguém é avisado do que ele mesmo fez.** Esta regra quase passou sem
teste: a primeira versão afirmava que o autor não recebia, mas o caso
usado era uma resposta pública de quem atende — plateia em que o autor
nunca esteve. A mutação sobreviveu. O caso que prova de verdade é o
chamado de um time: alguém do time escreve a nota interna, os outros
recebem e o autor não.

### Quantos, e por quanto tempo

Uma linha por **aparelho**, não por pessoa: quem usa o desktop no
escritório e o celular na rua quer o aviso nos dois, e o navegador dá
uma inscrição diferente para cada um. A preferência do que receber,
essa é por pessoa — quem desligou "nota interna" desligou nos três.

O que a pessoa guarda é o que **silenciou**, e não o que ligou. Na
lista do que foi ligado, todo motivo acrescentado depois nasceria
invisível, e ninguém volta a uma tela de preferências para descobrir
que apareceu opção nova.

Não há fila nem retentativa, e isso é escolha. Aviso é perecível:
reentregar "o cliente respondeu" vinte minutos depois, quando a pessoa
já leu e já respondeu, é ruído. A entrega confiável é a do e-mail, que
tem fila própria. O TTL é de meia hora — cobre o notebook fechado no
almoço e descarta o resto.

Inscrição que o serviço de push declara morta (404/410) é apagada na
hora. Sem isso a tabela acumula aparelho de gente que trocou de
computador, e cada aviso passa a gastar uma requisição inútil por
aparelho morto, para sempre.

### A permissão só se pede uma vez

O navegador guarda a resposta, e o "não" é definitivo do lado de cá. Por
isso a permissão é pedida **dentro do clique**, nunca ao carregar a
tela: site que pergunta na chegada é bloqueado por quem ainda nem sabia
o que ele faz. Bloqueado, a tela deixa de oferecer o botão e explica
onde liberar.

Sem par VAPID configurado a seção inteira some — mesma regra do
Copilot: não oferecer o que não funciona.

### O service worker não faz cache

`sw.js` só trata `push` e `notificationclick`. Não intercepta
requisição e não guarda nada, de propósito: service worker que serve
arquivo do cache é a maneira mais rápida de deixar alguém preso numa
versão velha do aplicativo, e o preço disso é alto demais para um ganho
que ninguém pediu aqui.

O clique reaproveita a aba já aberta em vez de abrir a décima janela.
Avisos com a mesma etiqueta (o id do chamado) se substituem: três
respostas seguidas no mesmo chamado viram um aviso atualizado, não três
empilhados na barra.

### O aplicativo nativo

`PushKind` já existe com um valor só (`WEB`). O aplicativo virá com
token de FCM ou APNs, e é para ele que o enum nasceu: acrescentar um
valor é migração de uma linha; descobrir depois que a tabela só sabia
falar de navegador seria outra história.

## 17. Ações automáticas: trocar a própria senha

O pedido: *"ele pode fazer algumas ações de forma automática, exemplo,
reset de senha… o sistema deve realizar de forma autônoma e enviar para
e-mail e WhatsApp dele"*. Feito — com duas adaptações que valem mais
que o código, e que ficam registradas aqui para não serem desfeitas por
engano.

### 1. O sistema não manda senha; manda um convite para escolher uma

O link vai pelo e-mail **e** pelo WhatsApp, como foi pedido. A senha,
não — e nunca chegou a existir: o Desk não sorteia senha nenhuma.

A razão é o canal. Mensagem é lida no aparelho destravado de quem
estiver por perto, fica no histórico do aplicativo, é encaminhada e vai
parar no backup da nuvem de alguém. Uma senha dentro dela **continua
valendo** depois de tudo isso. O link vale quinze minutos, abre uma vez
só, e depois disso é um texto inútil.

De quebra, o sistema nunca conhece a senha da pessoa — o que já era
verdade no resto do produto e passaria a não ser se ele a sorteasse.

### 2. A ação exige identidade provada, e e-mail não prova

Quem abre chamado por e-mail provou apenas que uma mensagem chegou com
aquele remetente, o que é falsificável. Na tela sem login provou menos:
digitou um nome.

Então a ação só corre quando o chamado nasceu **logado** (canal `WEB`)
ou **pelo integrador** (canal `API`, com o token da empresa, que já viu
a pessoa autenticada no sistema de origem — seção 13). Nos outros
canais o chamado abre normalmente e espera uma pessoa. É mais lento, e
é o certo.

### As outras cercas

- **Só a senha de quem pediu.** Não há caminho para trocar a de outro.
- **Conta de diretório não entra**: a senha é do AD, e trocá-la aqui
  daria a impressão de ter funcionado sem mudar nada onde a pessoa de
  fato entra.
- **Três links por pessoa por hora.** Sem isso, abrir o mesmo chamado
  dez vezes vira dez mensagens no telefone de alguém — incômodo
  dirigido, e feito pelo próprio sistema.
- **Aval pendente segura a ação**, e o aval a solta. Quem exige
  aprovação na categoria continua aprovando primeiro.

**Recusa nunca é silenciosa.** Cada cerca que barra escreve o motivo na
linha do tempo, em português e como nota **interna**: quem for atender
precisa saber por que o chamado caiu na mão dele, e o solicitante não
precisa aprender qual cerca teria de contornar.

### O que o link consegue, e o que não

O token é 32 bytes sorteados; o banco guarda o **SHA-256**, como o
refresh token. Quinze minutos, uso único, e pedir outro queima o
anterior — link velho esquecido numa caixa de e-mail não continua
valendo.

Trocar a senha **derruba todas as sessões abertas**. Se a troca
aconteceu porque alguém entrou na conta, deixar a sessão dele viva
anularia a troca.

O link não aparece na linha do tempo nem na lista de eventos: quem
atende lê aquilo, e o link troca a senha de quem pediu. O que a
timeline diz é que o envio aconteceu, por onde, e que a senha é
escolhida pela pessoa.

A tela confere o convite **antes** de pedir a senha. Digitar duas vezes
uma senha e só então descobrir que o link expirou é a forma mais
irritante possível de dar essa notícia. E a resposta é uma só —
expirado, usado e inexistente dizem "não vale mais", sem distinção:
quem tem o link pode não ser o dono.

A escada de bloqueio por IP conta **só o token desconhecido**. Contando
também o expirado, a pessoa certa que clica duas vezes num link velho e
pede outro ficaria bloqueada pelo próprio sistema.

### Um defeito que este trabalho descobriu

Modelo de chamado com categoria, aberto **logado** sem `categoryId`,
produzia um chamado **sem categoria nenhuma**. A tela sem login já
herdava a categoria do modelo; a logada dependia de o cliente mandar o
`categoryId` junto.

Sem categoria não há acordo de SLA, não há roteamento e — o que fez o
defeito aparecer — não há a exigência de aval que a categoria carrega.
Um modelo com ação automática e categoria "exige aprovação" se
resolveria sozinho, pulando o gestor. Hoje o modelo escolhido traz a
categoria dele quando quem abriu não escolheu uma, dos dois lados.

E a espera pelo aval pergunta pela **aprovação em aberto**, não pelo
status do chamado: o aval exigido por categoria não leva o chamado a
`EM_APROVACAO` (seção 10) — ele segue o curso normal enquanto espera.
Olhar só o status deixaria passar direto justamente o caso do pedido.

## 18. Cofre de senhas

A seção 8 dizia, sobre os campos de acesso remoto do equipamento: *"não
é cofre de senhas… essa pede um cofre de verdade, e o Desk não é um"*.
Esta seção desfaz aquela frase, e é justo dizer por quê: não porque o
nome mudou, mas porque as **três coisas que faltavam** passaram a
existir.

| O que faltava | O que existe agora |
|---|---|
| Chave própria | `VAULT_SECRET_KEY`, derivada por segredo |
| Compartilhar com validade | `SecretGrant` com prazo, que vence sozinho |
| Saber quem leu | `SecretAccess`, visível para o **dono** |

Os campos de acesso remoto continuam onde estão. São a resposta rápida
na tela do equipamento — "como eu entro nesta máquina agora" — e não
viraram cofre nem devem virar.

### O que se guarda

Login, senha e o que identifica o acesso, que muda com o tipo: **site**
pede o endereço, **computador** pede o equipamento do inventário,
**sistema** pede o nome dele. Um campo livre para os três produziria a
mesma planilha de onde estas senhas vêm, com outro nome.

### A cifragem, em três camadas

**Chave própria.** `VAULT_SECRET_KEY` é separada da
`CHANNEL_SECRET_KEY` de propósito. Aquela protege o que o servidor usa
o tempo todo (IMAP, Evolution); esta guarda senha de cliente. Juntas,
um vazamento de uma seria o vazamento das duas, e trocar uma obrigaria
a rodar as duas.

**Chave derivada por segredo.** Cada linha tem um sal aleatório, e a
chave que a cifra sai de `HKDF(mestra, sal)`. A mestra nunca cifra nada
diretamente.

**Texto cifrado amarrado à linha.** O id do segredo e o da organização
entram como dado autenticado (AAD) do GCM. Um `UPDATE` que copie o
`senhaCifrada` da linha do chefe para a sua não abre: a etiqueta não
confere. Sem isso, cifrar em repouso protegeria contra o dump do banco
e não contra quem escreve nele — e quem escreve no banco é uma pessoa
a mais do que quem o lê.

### Quem abre o quê

O dono, e quem ele deixou. O **administrador não lê** — vê que o
segredo existe e pode **assumi-lo**, que é outra coisa: um ato
registrado na trilha, que aparece na tela do dono anterior, e que não
tira o acesso dele.

Vale ser honesto sobre o que essa escolha compra. Ela **não** torna a
leitura impossível para um administrador determinado: ele assume e
depois abre. O que ela torna impossível é fazer isso **em silêncio**. É
accountability, não impossibilidade — e a alternativa, em que ninguém
recupera nada, tranca a empresa para fora do que é dela no primeiro
pedido de demissão.

Quem recebeu um segredo **não o reparte**. Se repartisse, uma concessão
de um dia viraria acesso permanente pelas costas de quem a deu.

### Compartilhar por tempo, ou até revogar

Foi o que o pedido descreveu: *"ele pode compartilhar por tempo, ou pra
sempre"*. "Para sempre" na tela se chama **"até você revogar"**, porque
é o que é — e "para sempre" faz parecer que não dá para tirar.

A concessão com prazo vence sozinha: ninguém precisa lembrar de
revogar, e é isso que a torna a opção certa para quem só precisa entrar
hoje. Compartilhar de novo com a mesma pessoa **estende o prazo** em
vez de criar uma segunda linha — duas linhas para a mesma pessoa é como
uma revogação deixa de revogar.

### A senha na tela

Sai por uma rota só, `POST /cofre/:id/revelar` — `POST` e não `GET`
pela mesma razão do acesso remoto: revelar é um **ato**. `GET` entraria
no histórico do navegador, em log de proxy e num `prefetch` que ninguém
pediu, e cada um seria uma cópia da senha fora do cofre.

Na tela ela some sozinha em trinta segundos. Isso não protege contra
quem quer copiá-la — quem quer, copia. Protege contra o que de fato
acontece: a senha do cliente aberta no monitor quando alguém chega para
falar com você, ou quando a reunião começa a compartilhar a tela.

### Um teste que não provava o que dizia

O teste afirmava "a senha não volta em nenhuma carga" e procurava, na
resposta, a senha em claro. Passava — e continuou passando quando o
`senhaCifrada` e o `sal` foram adicionados de propósito à vista da
lista.

O texto cifrado não é legível hoje, mas é metade do trabalho de quem um
dia tiver a chave mestra, e é uma cópia do segredo fora do cofre. Hoje
o teste procura os dois **nomes de campo**, não só o valor em claro.

## 19. Chat ao vivo, com presença

O pedido: *"quero que tenha chat ao vivo, as pessoas que estiverem
online, mostra que o chat ao vivo está aberto"*.

### O chat **é** a conversa do chamado

Cada linha do chat é um `TicketEvent`, o mesmo de uma resposta escrita
na caixa de texto (CLAUDE.md, regra 8). Uma tabela de mensagens à parte
criaria duas histórias do mesmo atendimento — a que a tela de chamado
mostra e a que ficou no chat —, que é exatamente o defeito do GLPI que
a regra 8 existe para corrigir.

O que o chat muda é a **entrega**, não o registro. Fechada a conversa,
o que sobra no chamado é a mesma linha do tempo de sempre, e quem abrir
o chamado daqui a um ano não descobre que parte do atendimento
aconteceu "no chat".

Do lado da tela, a mesma decisão: a `Conversa` relê quando chega
mensagem, em vez de encaixar a que veio pelo fluxo. Encaixar exigiria
manter duas listas iguais em sincronia, e é assim que nasce a mensagem
que aparece duas vezes — ou que some ao recarregar.

### SSE, e não WebSocket

O Desk não tinha WebSocket, e o que ele precisa aqui é unidirecional: o
servidor empurra, o cliente já tem `POST` para escrever — com a
validação, a permissão e a trilha que o `POST` de responder já carrega.

O fluxo é lido com **`fetch` e `ReadableStream`**, não com
`EventSource`. `EventSource` não carrega cabeçalho `Authorization`, e a
saída seria pôr o token na URL — onde ele cairia no log do proxy e no
histórico do navegador. O preço é reimplementar a leitura de SSE em
vinte linhas; o preço da outra saída é um token em texto claro em dois
lugares que ninguém limpa.

### A fonte é o banco, não um barramento em memória

A cada volta, o fluxo consulta os eventos do chamado desde a última
marca. Parece ingênuo, e é a escolha certa aqui: **a API roda em mais
de um processo**, e uma mensagem gravada pelo processo A precisa chegar
a quem escuta no processo B. Um barramento em memória não a entregaria,
e o defeito apareceria só em produção, com mais de um processo no ar.

Uma consulta indexada por chamado, a cada dois segundos, custa pouco em
dezenas de conversas simultâneas — que é o tamanho deste produto. Se um
dia forem milhares, é **aqui** que se mexe: `LISTEN/NOTIFY` do Postgres
ou o Redis que já está na infraestrutura. Ficou escrito no controlador
para quem chegar nesse dia não precisar descobrir sozinho.

### A presença, e por que ela mora no banco

Mesma razão do `LoginThrottle`: mais de um processo. Uma linha por
**pessoa**, não por conexão — duas abas abertas são uma pessoa online.

"Está online" é ter batido o coração nos últimos `SEGUNDOS_ONLINE`. O
número mora em `packages/shared` junto do intervalo da batida: se os
dois viessem de arquivos diferentes, mexer em um deixaria todo mundo
offline.

**Sair é a falta da batida.** Não existe "sair do chat" a ser chamado
no fechamento da aba — `beforeunload` é entregue quando o navegador
quer, e não chega quando a aba morre de vez. Mas esperar quarenta e
cinco segundos para o outro lado perceber é ruim, então há dois atalhos
por cima da rede de segurança:

- a limpeza do efeito, para navegação dentro do aplicativo;
- `pagehide` + `fetch(..., { keepalive: true })`, para a aba que fecha
  ou recarrega.

`keepalive` é o detalhe que faz funcionar: um `fetch` comum disparado
ao sair é **cancelado** pela própria navegação que o causou. E
`sendBeacon`, que seria o reflexo, não serve — não carrega
`Authorization`.

### "O chat está aberto" quer dizer que tem gente do outro lado

O selo não acende para quem está sozinho na conversa. Acender ali seria
prometer resposta imediata de ninguém, e a promessa do selo é
exatamente essa: vale escrever e esperar agora.

"Digitando" apaga sozinho em seis segundos, e a batida que o liga sai
no máximo uma vez a cada três — uma por tecla viraria cem requisições
por parágrafo.

### Quem lê ao vivo não recebe e-mail

Consequência do resto, e um defeito que teria nascido junto sem ela:
uma conversa de vinte linhas viraria vinte e-mails na caixa de quem já
as leu na tela.

Antes de enfileirar a saída, a fila pergunta se quem receberia está com
esta conversa aberta. Se está, não sai — ele já está lendo. Se saiu, a
mensagem seguinte volta a sair pelo canal dele, sem ninguém precisar
combinar nada. Vale só para quem tem conta: contato de fora não tem
presença, e continua recebendo por onde falou.

### Dois tropeços que valem registro

**A cerca do chamado não era a da organização.** O teste barrava um
usuário de **outra** empresa e passava — mas o que a regra protege é
outra coisa: o colega da mesma casa, com o mesmo papel, num chamado que
não é dele nem do time dele. Tirar a regra de ator do serviço não
derrubava teste nenhum. Hoje derruba.

**Uma asserção que falha com o fluxo aberto trava a suíte.** O teste
conferia o status e só então fechava o corpo da resposta; quando a
asserção falhava, a conexão SSE ficava viva e o processo de teste não
terminava — a falha virava travamento, que é muito pior de
diagnosticar. Hoje o corpo é fechado antes de conferir.
