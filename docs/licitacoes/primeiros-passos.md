# Primeiros passos em licitações públicas

Guia para quem tem CNPJ e nunca vendeu para o governo. Escrito para
acompanhar o radar do `apps/licitacoes` — o radar acha a oportunidade,
este documento explica o que fazer com ela.

> **Valores citados são de 2026**, atualizados pelo Decreto nº 12.807/2025.
> Eles são corrigidos por decreto todo ano. Confira antes de decidir preço.

---

## 1. O que o sistema faz e o que ele não faz

| O sistema faz | Você faz |
|---|---|
| Varre o PNCP todo dia | Decide o que vale disputar |
| Filtra pelo que você vende | Lê o edital inteiro |
| Pontua e ordena por prioridade | Calcula o preço |
| Alerta prazo, presencial, registro de preços | **Envia a proposta** |
| Guarda o histórico | Assina e entrega |

**O envio da proposta nunca é automatizado, e isso é decisão de projeto, não
limitação técnica pendente de resolver.** Três razões:

1. **Não existe API de envio.** As APIs públicas de governo são de consulta.
   A proposta é enviada pela interface do Compras.gov.br ou da plataforma do
   órgão, e cada uma tem login próprio.
2. **Exige certificado digital.** Automatizar login com o seu e-CNPJ viola os
   termos de uso da maioria das plataformas.
3. **A proposta é ato jurídico vinculante.** Se um robô errar o preço e você
   ganhar, você é obrigado a entregar naquele valor. Desistir gera multa e
   pode levar a impedimento de licitar. Junto da proposta vai uma declaração
   de que você cumpre os requisitos de habilitação — declaração falsa é crime.

Robô de lance na fase de disputa cai na mesma categoria: existe no mercado, e
boa parte dos editais proíbe expressamente.

---

## 2. O bloqueio imediato: SICAF

Você tem CNPJ, mas sem SICAF não há proposta a enviar. O **Sistema de
Cadastramento Unificado de Fornecedores** é o cadastro que comprova que sua
empresa está habilitada. É gratuito, feito pela internet, e vale para todo o
território nacional.

### O que você precisa antes de começar

- **Certificado digital ICP-Brasil** — e-CNPJ (pessoa jurídica) ou e-CPF do
  responsável. Este é o único item que custa dinheiro; é emitido por
  autoridade certificadora credenciada e costuma ter validade de 1 a 3 anos.
- **Conta gov.br** do responsável legal.

### Os seis níveis

O cadastro é dividido em níveis, e cada um exige um conjunto de documentos:

| Nível | O que é | Documentos típicos |
|---|---|---|
| I | Credenciamento | Dados da empresa e do responsável |
| II | Habilitação jurídica | Contrato social ou requerimento de empresário, CPF e RG dos sócios |
| III | Regularidade fiscal federal e trabalhista | CND Federal (Receita/PGFN), CRF do FGTS, CNDT |
| IV | Regularidade fiscal estadual e municipal | Certidões negativas do seu estado e do seu município |
| V | Qualificação técnica | Atestados de capacidade técnica |
| VI | Qualificação econômico-financeira | Balanço patrimonial, certidão negativa de falência |

**Para começar, mire nos níveis I a IV.** Eles cobrem a maioria das dispensas
eletrônicas e pregões de pequeno valor. Nível V (atestado) é o que trava quem
está começando — veja a seção 5.

### Como fazer

1. Acesse o SICAF em <https://www.gov.br/compras/pt-br/sistemas/sicaf-digital>
2. Entre com o certificado digital.
3. Preencha o credenciamento e envie os documentos digitalizados
   (aceita `.pdf`, `.zip`, `.rar`, `.7z` — nada em papel).
4. Aguarde a validação.

**O cadastro tem validade anual e precisa ser renovado.** As certidões vencem
antes disso — geralmente a cada 3 a 6 meses. Certidão vencida no dia da
disputa desclassifica, e é a causa mais boba de perder uma licitação já
ganha. Coloque na agenda.

---

## 3. Por onde começar: dispensa eletrônica

A **dispensa eletrônica** (art. 75 da Lei 14.133/2021) é a contratação direta
para valores baixos. É o melhor caminho de entrada: rito curto, edital
simples, menos concorrentes.

**Limites em 2026:**

- **R$ 65.492,11** — compras e serviços em geral
- **R$ 130.984,20** — obras e serviços de engenharia

O órgão publica o aviso no Compras.gov.br e no PNCP, recebe propostas por
alguns dias e, havendo mais de um interessado, abre uma fase de lances.

No radar, a dispensa é a modalidade **8**.

### O outro caminho: cota exclusiva ME/EPP

A LC 123/2006, art. 48, I, reserva contratações de até **R$ 80.000 por item**
exclusivamente a microempresas e empresas de pequeno porte. Esse valor está
na lei e não é corrigido pelo decreto anual.

Na prática isso significa que, sendo ME ou EPP, existe uma faixa inteira do
mercado onde empresa grande não pode entrar. É por isso que o radar pontua
essa faixa — e é por isso que vale confirmar seu enquadramento na Receita
antes de qualquer coisa.

> O radar trata a exclusividade como **indício**, nunca como certeza: ela
> vale por item, e a consulta do PNCP só expõe o valor total da contratação.
> A confirmação está sempre no edital.

---

## 4. Como uma dispensa eletrônica acontece

```
Órgão publica o aviso  →  PNCP + Compras.gov.br
        ↓
Prazo de propostas (normalmente 3 dias úteis)  ←── o radar te avisa AQUI
        ↓
Você envia proposta de preço na plataforma
        ↓
Fase de lances, se houver mais de um interessado
        ↓
Menor preço é convocado a comprovar habilitação
        ↓
Adjudicação → Homologação → Empenho → Entrega → Pagamento
```

Duas coisas que surpreendem quem começa:

- **Entre homologação e pagamento passa tempo.** Você entrega primeiro e
  recebe depois, normalmente em 30 dias, às vezes mais. É por isso que o
  perfil tem `valorMaximo`: o limite não é o que você consegue vender, é o
  que seu caixa aguenta financiar até receber.
- **Ganhar por preço não basta.** Se a certidão estiver vencida na hora da
  habilitação, você é desclassificado e o segundo colocado assume.

---

## 5. Os erros que eliminam iniciante

| Erro | Consequência |
|---|---|
| Certidão vencida no dia | Desclassificação, mesmo com o menor preço |
| Não ler a especificação até o fim | Entregar item errado, ou descobrir exigência impossível depois de ganhar |
| Ignorar prazo e local de entrega | Frete come a margem inteira |
| Preço sem contar tributos e frete | Ganhar e ter prejuízo — e ainda ser obrigado a entregar |
| Desistir depois de ganhar | Multa e risco de impedimento de licitar |
| Confundir registro de preços com venda | Ata não obriga o órgão a comprar; estocar por conta é prejuízo |

**Sobre o nível V (atestado de capacidade técnica):** é o ovo e a galinha de
quem começa — exigem experiência que você só consegue vendendo. Duas saídas
legítimas: comece pelos editais que não exigem atestado (comuns em dispensa
de baixo valor), e guarde nota fiscal e comprovante de toda entrega feita,
inclusive para cliente privado, porque atestado pode vir de lá também.

---

## 6. Checklist antes de ofertar preço

- [ ] SICAF ativo, níveis I a IV no mínimo
- [ ] Todas as certidões válidas na data prevista da habilitação
- [ ] Edital lido até o fim, inclusive anexos
- [ ] Especificação do item confere exatamente com o que você fornece
- [ ] Prazo e local de entrega são viáveis para você
- [ ] Preço cobre custo + tributos + frete + margem
- [ ] Caixa aguenta entregar e esperar o pagamento
- [ ] Você tem cadastro na plataforma onde a proposta será enviada
- [ ] Se a disputa for aberta, você estará na tela no horário

---

## Fontes

- [PNCP — API de consulta](https://pncp.gov.br/api/consulta/swagger-ui/index.html)
- [Portal de Compras do Governo Federal](https://www.gov.br/compras/pt-br)
- [SICAF Digital](https://www.gov.br/compras/pt-br/sistemas/sicaf-digital)
- [Manual do SICAF](https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manual-fase-externa/manual-sicaf/manual_do_sicaf__versao_final_sistema_fornecedor-1-5.pdf)
- [Dados abertos do Compras.gov.br](https://dadosabertos.compras.gov.br/swagger-ui/index.html)
