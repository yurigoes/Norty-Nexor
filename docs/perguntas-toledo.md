# Perguntas técnicas — Toledo do Brasil

Documento para enviar ao contato técnico/comercial da Toledo. As
respostas dos blocos **A** e **B** decidem a arquitetura; as demais
decidem custo e prazo.

Marcadas com **[BLOQUEANTE]** as perguntas que impedem o início do
desenvolvimento enquanto não forem respondidas.

---

## Contexto para enviar junto

> Estamos desenvolvendo uma solução de prevenção de perdas para o varejo
> alimentar, distribuída como serviço. O sistema associa cada pesagem
> feita numa balança etiquetadora ao funcionário que a realizou e à
> imagem da câmera de CFTV no momento, e depois concilia a etiqueta
> emitida com a venda registrada no caixa — apontando o que foi pesado e
> não passou pelo caixa.
>
> A balança é o coração do sistema. Precisamos entender o que a linha
> Prix oferece hoje em identificação de operador e em acesso às
> transações, para desenhar a integração da forma correta e, se fizer
> sentido, avaliar uma parceria técnica.

---

## A. Identificação do operador por RFID

1. **[BLOQUEANTE]** Quais modelos da linha Prix saem de fábrica com
   **leitor RFID integrado** para controle de operador? Pedimos o código
   de produto exato de cada um (identificamos a **Prix 5 Plus 32 kg com
   leitor RFID**, mas queremos a lista completa e atual).
2. Qual a **frequência e o padrão** do leitor: 125 kHz (EM4100/proximidade)
   ou 13,56 MHz (MIFARE Classic / DESFire)? Precisamos saber por uma
   razão de segurança: credencial de 125 kHz é clonável com equipamento
   de baixo custo, o que enfraquece a premissa antifraude do sistema.
3. A balança aceita **credencial de terceiros** (cartão/tag já usado no
   controle de acesso do cliente) ou só a credencial fornecida pela
   Toledo? Existe cadastro do UID da tag?
4. O operador identificado pelo RFID fica gravado **em cada transação**?
   Em qual campo do registro e do arquivo de coleta?
5. Quantos operadores por balança? (Vimos "até 500" na documentação do
   MGV6 — confirmar por modelo.) Como é feita a carga do cadastro:
   `Opecad.txt`, MGV, API?
6. Existe **kit de adaptação** de leitor RFID para balanças Prix já
   instaladas em campo (Prix 4, Prix 5 sem leitor)? Se não, o roadmap
   prevê isso?
7. A **Prix 6** tem ou terá leitor RFID?

---

## B. Acesso às transações — o ponto crítico

Nosso sistema precisa exibir os dados da pesagem na imagem da câmera
logo após a emissão da etiqueta. Quanto menor a latência, melhor —
mas o projeto tem um modo degradado, então a resposta honesta aqui nos
ajuda mais do que a resposta otimista.

8. **[BLOQUEANTE]** A balança consegue **enviar** (*push*) cada transação
   no momento em que a etiqueta é impressa — por TCP, HTTP, MQTT ou
   qualquer outro transporte? Ou o acesso é sempre por **coleta**
   (*polling*) iniciada pelo software de gerenciamento?
9. **[BLOQUEANTE]** Se for por coleta: qual o protocolo/endpoint, qual a
   **frequência mínima recomendada** e qual o **impacto na operação da
   balança** durante a coleta — ela fica indisponível para pesagem?
10. Qual a **latência típica** entre a impressão da etiqueta e o dado
    ficar disponível para coleta?
11. **[BLOQUEANTE]** É possível ler as transações **direto da balança**,
    ponto a ponto, sem intermediar pelo MGV6/MGV7? Isso é suportado e
    homologado, ou a Toledo exige o MGV como camada de integração?
12. O **MGV6/MGV7 expõe web service / API documentada** para integração
    de terceiros? Como obtemos a documentação — há NDA, licenciamento ou
    custo?
13. **Layout do arquivo/registro de coleta de vendas**: pedimos a
    especificação completa. Confirmar especialmente a presença de:
    - número **sequencial** da transação
    - data e hora **com segundos**
    - identificação do **operador**
    - PLU/código do produto, **peso**, preço por kg, total
    - tara utilizada
    - tipo de operação e indicador de **reimpressão**
    - indicador de **cancelamento feito na própria balança**
14. A balança registra **reimpressão de etiqueta** e **cancelamento**
    como eventos próprios? Eles saem na coleta e são distinguíveis de uma
    pesagem normal?

---

## C. Código de barras da etiqueta

Este bloco decide se conseguimos uma **baixa unitária exata** (cada
etiqueta identificada individualmente) ou se ficamos na conciliação por
peso e horário. Ambas funcionam no nosso desenho; a primeira é melhor.

15. **[BLOQUEANTE]** Confirmar, **por modelo**, quais simbologias a
    etiqueta suporta: EAN-13, **Code 128**, **GS1 DataBar Expanded**,
    outras. (Vimos Code 128 e GS1 DataBar Expanded na documentação do
    MGV7.)
16. **[BLOQUEANTE]** Na composição do Code 128 / GS1 DataBar Expanded,
    existe um campo de **número sequencial da transação** ou contador
    incremental que possa entrar no código impresso?
17. É possível compor o código com **Identificadores de Aplicação GS1** —
    especificamente **AI (21) número de série** e **AI (10) lote** — ao
    lado do GTIN (01) e do peso líquido (3103)?
18. Se não houver sequencial nativo: os **campos extras** de layout
    (`Campext1.txt`, `Campext2.txt`) aceitam valor **dinâmico por
    transação**, ou são estáticos por produto?
19. O sequencial da transação **reinicia**? Em que evento (diário, por
    carga, por operador)? Qual a largura em dígitos?
20. A balança pode imprimir um **QR Code** na etiqueta com **conteúdo
    dinâmico** por transação?
21. A Toledo tem **clientes em produção** usando serial ou lote no código
    de barras da etiqueta de balança? Houve problema de leitura nos PDVs
    do mercado brasileiro?

---

## D. Parceria, homologação e desenvolvimento

22. Existe **programa de parceiro tecnológico / ISV**? Como funciona a
    homologação de uma integração de terceiro?
23. Há **SDK, biblioteca ou DLL** disponível? Para quais linguagens e
    sistemas operacionais?
24. Existe **ambiente de testes** — balança de demonstração, emulador ou
    massa de dados — para desenvolvimento antes da instalação em campo?
25. O MGV está disponível em **nuvem**, atendendo rede multi-loja? Como é
    a topologia recomendada para uma rede com dezenas de lojas?
26. Condições comerciais: um integrador pode **revender** a balança como
    parte da solução, ou o cliente final compra direto da Toledo/rede
    autorizada?

---

## E. Hardware e instalação

27. **Prix 5 Plus com RFID** — pedimos a ficha técnica: dimensões,
    alimentação, e a lista de **portas disponíveis** (USB, serial,
    Ethernet, Wi-Fi). Sobra alguma porta USB livre para uso do
    integrador?
28. O firmware da balança é **aberto a aplicações de terceiros**
    (possibilidade de embarcar um agente leve) ou é fechado? Se for
    Linux, existe modo de desenvolvedor?
29. Para uma **estação de estorno** — um posto no setor onde o produto
    devolvido é reconferido — qual o modelo mais simples da linha que
    entrega **peso por porta serial/USB** para um computador, sem
    necessidade de impressora?
30. Prazo de entrega e disponibilidade dos modelos com RFID.

---

## Como as respostas mudam o projeto

| Resposta | Consequência |
|---|---|
| B8 = existe *push* por transação | Overlay em tempo real de verdade; arquitetura simples |
| B8 = só coleta, latência alta | Entra o modo degradado: crachá aparece na hora, dados do produto entram no evento e no player alguns segundos depois |
| B11 = leitura ponto a ponto liberada | Dispensamos o MGV na topologia; instalação de loja muito mais simples |
| B11 = MGV obrigatório | O MGV vira dependência de venda; entra no custo do cliente e no *onboarding* |
| C16/C17 = existe serial no código | **Cenário A**: baixa unitária exata (ainda dependente de o PDV preservar o código — ver ressalva abaixo) |
| C16/C17 = não existe | **Cenário B**: conciliação por SKU + peso + janela de tempo, com fila de revisão humana |
| A2 = 13,56 MHz MIFARE | Credencial segura; seguimos |
| A2 = 125 kHz | Credencial clonável; o crachá deixa de ser prova e vira só conveniência — o vídeo assume o papel de evidência |

**Ressalva importante sobre C16/C17:** mesmo que a balança imprima um
serial, ele só serve para baixa unitária se **sobreviver até o registro
da venda**. Muitos PDVs traduzem o código de barras de pesável para o
código interno do produto e descartam o original, e nesse caso o serial
não chega ao XML da NFC-e. Ou seja: o Cenário A depende da balança
**e** do PDV do cliente. Por isso o Cenário B é o que sustenta o
produto, e o A é um *upgrade* negociado loja a loja.

---

## Interlocutores sugeridos

Este conjunto de perguntas cruza três áreas da Toledo. Vale pedir, já no
primeiro contato, que a conversa envolva:

- **Suporte/Engenharia de aplicação** — blocos B e C
- **Produto (linha Prix)** — blocos A e E
- **Comercial / canais** — bloco D

Sugestão prática: começar por um pré-venda técnico do canal autorizado,
que costuma responder A e E de imediato, e escalar B e C — que são as
que realmente decidem — para a engenharia.
