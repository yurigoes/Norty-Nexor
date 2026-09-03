# Perguntas técnicas — Toledo do Brasil

Documento para enviar ao contato técnico/comercial da Toledo. As
respostas dos blocos **A** e **B** decidem a arquitetura; as demais
decidem custo e prazo.

> **Atualização:** lemos o manual oficial da Prix 5 Plus (guia rápido +
> manual do usuário, rev. 05-25, firmware 8.7). Isso já respondeu boa
> parte do bloco A e todo o C15/C16/C17/E0.6/E0.7. As perguntas abaixo
> foram atualizadas — as respondidas ficam marcadas **[RESPONDIDA PELO
> MANUAL]** com a resposta entre colchetes, e não precisam ir para a
> Toledo. Detalhe completo em
> [`homologacao-toledo-prix5plus.md`](./homologacao-toledo-prix5plus.md).

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

### A.0 — Bloqueio da balança (a pergunta mais importante do documento)

Se a balança opera sem identificação, o leitor RFID não previne nada:
basta não se identificar. Todo o valor do controle depende desta
resposta.

0.1. **[RESPONDIDA PELO MANUAL]** A balança pode ser configurada para
   **exigir identificação do operador**, com o teclado bloqueado até a
   autenticação? **[Não, na Prix 5 Plus documentada, firmware 8.7. O
   parâmetro C14 faz a balança *pedir* o código depois da pesagem, mas
   um toque de tecla pula o pedido e a venda é concluída sem operador.
   Pergunta que sobra: existe, em firmware mais recente, algum modo que
   remova essa saída?]**
0.2. **[BLOQUEANTE]** Onde vive essa configuração: na própria balança, no
   MGV, ou nos dois? **Quem pode alterá-la** — exige senha de supervisor?
   A alteração fica **registrada em log** acessível por integração?
0.3. Como a **sessão do operador** encerra: por tempo de inatividade, por
   número de transações, por nova leitura de crachá, por fim de turno? É
   configurável?
0.4. **[PARCIALMENTE RESPONDIDA]** O código numérico é o **único**
   método documentado nesta linha — não há RFID para ter fallback dele.
   Pergunta que sobra: nas balanças com RFID (se confirmado SKU de
   fábrica — ver A1.x abaixo), a transação registra qual dos dois
   métodos autenticou?
0.5. A balança expõe o **evento de login do operador** em tempo real —
   separado da transação de pesagem? Isso nos permitiria mostrar o nome
   do funcionário na câmera no instante do crachá, antes da pesagem.

### A.1 — Modelos e credenciais

1. **[BLOQUEANTE — reforçada]** O manual oficial da Prix 5 Plus
   (rev. 05-25, firmware 8.7) que temos em mãos **não menciona RFID em
   nenhuma das 118 páginas**, e o diagrama do painel mostra só teclado
   numérico. Perguntamos direto: a "Prix 5 Plus com leitor RFID"
   anunciada por revendedores (ex.: Digimaq) é **SKU de fábrica
   Toledo**, com manual próprio, ou é **retrofit do integrador** (leitor
   externo apresentado comercialmente como parte da balança)? Se for de
   fábrica, pedimos o código de produto exato e o manual específico —
   este documento não a cobre. Quais outros modelos da linha Prix saem
   de fábrica com leitor integrado?
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
13b. **Layout do arquivo de CATÁLOGO/PREÇO** — distinto do arquivo de
    coleta de vendas da pergunta 13. É o arquivo que o MGV7 exporta (ou
    de onde carrega a balança) com PLU, descrição, categoria e preço
    por kg. Motivo: além da conciliação de vendas, queremos alimentar
    um segundo consumidor — o sistema de mídia indoor do cliente, que
    mostra o preço atualizado num telão da loja (ver
    [`../integracao-midia-indoor.md`](../integracao-midia-indoor.md)).
    Não precisa de tempo real — só o layout do arquivo e a frequência
    com que ele é regravado.
13c. O **MGV Cloud** (citado no manual ao lado do MGV7) expõe uma API
    própria para leitura de catálogo, separada da pergunta 12 sobre
    web service de transações? Se sim, é o caminho preferido para
    clientes com múltiplas lojas.
14. A balança registra **reimpressão de etiqueta** e **cancelamento**
    como eventos próprios? Eles saem na coleta e são distinguíveis de uma
    pesagem normal?

---

## C. Código de barras da etiqueta

Este bloco decide se conseguimos uma **baixa unitária exata** (cada
etiqueta identificada individualmente) ou se ficamos na conciliação por
peso e horário. Ambas funcionam no nosso desenho; a primeira é melhor.

15. **[RESPONDIDA PELO MANUAL]** Quais simbologias a etiqueta suporta?
    **[EAN-13 (padrão) + um segundo código Code 128, parâmetro C18,
    com 13 composições pré-definidas. GS1 DataBar Expanded aparece só
    em marketing, sem parâmetro local documentado — ver pergunta 15b.]**
15b. GS1 DataBar Expanded é citado na descrição geral da Prix 5 Plus
    ("para a gestão da validade de produtos, com o MGV 7") mas não tem
    parâmetro local equivalente ao C18. Ele existe como opção real de
    impressão, e se sim, é configurado onde — na balança ou só via
    MGV7? Ele aceita Identificadores de Aplicação GS1 (AI 21 serial),
    ou é usado só para validade?
16. **[RESPONDIDA PELO MANUAL]** Existe sequencial na composição?
    **[Sim — parâmetro C18, Tipo 3 (`EAN13+DATA+HORA+ENDEREÇO+
    SEQUENCIAL`) e Tipo 7 (`EAN13+PESO/QUANTIDADE+DATA+HORA+
    END.BALANÇA+SEQUENCIAL`). É local, não depende de GS1 nem de AI
    21.]**
17. É possível compor o código com **Identificadores de Aplicação GS1** —
    especificamente **AI (21) número de série** e **AI (10) lote** — ao
    lado do GTIN (01) e do peso líquido (3103)?
18. Se não houver sequencial nativo: os **campos extras** de layout
    (`Campext1.txt`, `Campext2.txt`) aceitam valor **dinâmico por
    transação**, ou são estáticos por produto?
19. **[REFINADA]** No sequencial do Tipo 3/Tipo 7 do parâmetro C18:
    qual a **largura em dígitos**? Ele **reinicia** — e em que evento
    (diário, por carga do MGV7, nunca, só ao estourar a largura)?
19b. O parâmetro **C18 é ajustável localmente** pelo técnico na
    balança (com a senha de programação), ou depende de configuração
    feita pelo MGV7? Se for puramente local, qualquer balança em campo
    pode ir para Tipo 7 sem depender do software de retaguarda — muda
    o plano de implantação do piloto.
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

### E.0 — Leitor USB ligado direto na balança

0.6. **[RESPONDIDA PELO MANUAL]** A porta USB da Prix 5 aceita
   dispositivo HID? **[Não há porta USB documentada na Prix 5 Plus —
   a ficha técnica lista só Ethernet e Wi-Fi como interface de
   comunicação. Pergunta que sobra, só se A1.x confirmar variante de
   fábrica com RFID: aquela variante tem alguma porta que este manual
   não cobre?]**


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
| **A0.1 = a balança bloqueia** | O controle é real e local, funciona com a rede caída. Topologia 1 do §5.7 do estudo |
| **A0.1 = não bloqueia** | O RFID vira só rastreio, não prevenção. O produto passa a depender inteiramente da detecção (`operacao_sem_identificacao` em vermelho + alerta) |
| A0.2 = supervisor pode desligar sem log | Precisamos detectar a mudança pelo dado: transações chegando sem operador viram alerta de configuração alterada |
| A0.5 = há evento de login em tempo real | Nome do funcionário aparece na câmera no instante do crachá, independente da latência da transação |
| E0.6 = a porta USB aceita HID | **Retrofit trivial** do parque instalado: leitor plugado na balança, sem integração nenhuma |
| E0.6 = porta só para carga | Retrofit fica na topologia 3 (leitor no *edge*): identifica e registra, mas não bloqueia |

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
