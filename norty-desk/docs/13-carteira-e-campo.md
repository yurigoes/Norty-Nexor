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
