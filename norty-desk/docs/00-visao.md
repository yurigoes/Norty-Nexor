# 00 — Visão

## O problema

> **Correção de 10/09/2026.** O parágrafo abaixo está factualmente
> errado e é mantido por honestidade de registro: **a Norty não opera um
> GLPI.** O levantamento em thor e heimdall não achou GLPI em máquina
> nenhuma; `desk.norty.com.br` é uma aplicação Next.js no heimdall, que
> passa a ser retaguarda. O Norty Desk sobe em `chamados.norty.com.br`.
>
> O que **não** muda: a paridade funcional com o GLPI segue como
> requisito, e a leitura de por que o GLPI acerta no domínio e erra na
> implementação continua valendo — ela veio da documentação e do código
> do GLPI 11, não da instalação da Norty.

A Norty opera hoje um GLPI em `desk.norty.com.br`. O GLPI acerta no
domínio: é ITIL de verdade, com chamado, requisição, problema, mudança,
SLA e OLA separados, aprovação em etapas, base de conhecimento e
inventário de ativos. Vinte anos de refinamento de processo estão ali.

O que envelheceu é a implementação, e ela envelheceu de um jeito que
custa caro todo dia:

- **A interface é de 2009.** Formulário de chamado com trinta campos na
  mesma tela, abas que recarregam a página, tabela de busca com
  `searchOption` numerado. O solicitante desiste e liga para o suporte.
- **Só existe uma porta.** Quem não entra no GLPI abre chamado por
  e-mail, e o coletor IMAP é frágil. WhatsApp — que é como o cliente da
  Norty realmente fala — não existe.
- **Integrar é doloroso.** A API REST exige `initSession`, devolve
  `session_token`, trava a sessão em escrita e identifica campos por
  número. Nenhuma equipe de produto quer consumir isso.
- **O modelo de dados é largo demais.** `glpi_tickets` tem 47 colunas,
  metade delas de SLA e OLA denormalizados. A timeline do chamado está
  espalhada por quatro tabelas (`itilfollowups`, `tickettasks`,
  `itilsolutions`, `documents_items`) que a tela remonta na mão.
- **Metade do produto não é usada.** 623 classes de domínio. A Norty usa
  chamado, categoria, SLA, base de conhecimento e usuários. Não usa
  inventário de rack, PDU, cartucho de impressora nem licença de
  software.

## O produto

**Norty Desk** é a central de serviços da Norty: o domínio ITIL do GLPI,
reescrito na stack que a Norty já opera (React + NestJS + Postgres),
com o recorte de módulos que a Norty de fato usa e três coisas que o
GLPI não entrega.

### As três apostas

1. **Multicanal de primeira classe.** Web, e-mail e WhatsApp (Evolution
   API) são portas iguais para o mesmo chamado. Abrir, consultar e
   anexar arquivo funciona pelos três. O agente responde uma vez e o
   solicitante recebe pelo canal em que falou.

2. **Uma timeline, não quatro tabelas.** Todo acontecimento de um chamado
   — mensagem, tarefa, anexo, aprovação, mudança de status, entrada de
   e-mail, áudio do WhatsApp — é um evento na mesma linha do tempo,
   ordenado, com autor e visibilidade. É como o usuário pensa no
   chamado, e passa a ser como o banco o guarda.

3. **API que dá vontade de consumir.** REST com JWT, recursos com nome,
   campos com nome, paginação por cursor, webhooks de saída. Sem
   `session_token`, sem `searchOption: 12`.

### O que o Desk deliberadamente não é

Não é um substituto de inventário de datacenter. Rack, PDU, cabo,
cartucho, licença de software e o agente de inventário do GLPI ficam de
fora (ver `docs/02-gap-analysis.md`, seção "O que corta"). Se a Norty
precisar disso depois, entra como módulo, não como premissa.

## Quem usa

| Perfil | O que faz | Onde entra |
|---|---|---|
| **Solicitante** | Abre e acompanha os próprios chamados | Portal, e-mail, WhatsApp |
| **Agente** | Atende, classifica, resolve | Aplicativo |
| **Supervisor** | Distribui fila, acompanha SLA, aprova | Aplicativo |
| **Gestor** | Lê indicadores, não atende | Painéis |
| **Administrador** | Configura organizações, SLA, categorias, canais | Aplicativo |

## Princípios

1. **O domínio vem do GLPI; a implementação, não.** Toda decisão de
   modelagem que copia o GLPI está rastreada em
   `docs/03-modelo-de-dados.md`. Toda decisão que se afasta dele tem
   justificativa escrita em `docs/02-gap-analysis.md`.
2. **O canal não tem regra de negócio.** O adaptador traduz e sai.
3. **Configurável não é sinônimo de bom.** O GLPI tornou tudo
   configurável e virou um produto que precisa de consultor. O Desk
   escolhe padrões e configura o que muda entre clientes de verdade.
4. **Multi-tenant desde a primeira linha.** Escopo por organização não é
   coisa que se adiciona depois.
