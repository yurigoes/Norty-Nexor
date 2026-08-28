# Triagem de currículos

Ferramenta local para separar, entre muitos currículos, quem vale chamar para
entrevista — e convocar essa pessoa pelo WhatsApp em um clique.

Ela lê PDF, DOCX, TXT e RTF, dá uma nota de aderência do candidato à vaga que
você descreveu, encontra o nome e o telefone dentro do arquivo e monta o link
do WhatsApp já com a mensagem de convite escrita.

Roda inteira na sua máquina. Nenhum currículo é gravado em disco nem enviado
para lugar nenhum — a única exceção é a análise por IA, que é opcional e só
acontece quando você clica.

## Como usar

```bash
cd ferramentas/triagem-curriculos
npm install
npm start
```

O navegador abre em <http://localhost:5199>. Então:

1. **Descreva a vaga** na coluna da esquerda: os termos que você precisa
   encontrar, o peso de cada um e quais são obrigatórios.
2. **Arraste os currículos** para a área pontilhada (pode soltar a pasta
   inteira).
3. **Leia a lista**, já ordenada da maior nota para a menor.
4. **Clique em "Convidar no WhatsApp"** — abre a conversa com a mensagem
   pronta, é só enviar.

A vaga fica salva em `vagas/*.json` e pode ser reaproveitada depois. Mudar um
critério repontua todo mundo na hora, sem precisar reenviar os arquivos.

## Como a nota é calculada

Cada critério vale o peso que você deu a ele. A nota é quanto do peso total da
vaga o currículo cobre, de 0 a 100:

| Situação | O que aparece |
|---|---|
| Nota ≥ 75 | **Forte** — chamar |
| Nota ≥ 50 | **Talvez** — depende do volume de candidatos |
| Nota < 50 | **Fraco** |
| Falta um obrigatório | **Não atende** — independente da nota |

Critério **obrigatório** é eliminatório de propósito: sem isso, quem escreve
bem o currículo passa na frente de quem realmente tem o requisito.

A **experiência** entra como um critério à parte. A ferramenta soma os períodos
datados descritos no currículo (`03/2019 até atual`, `2016 - 2020`), unindo os
que se sobrepõem, e considera também a menção direta ("6 anos de experiência").
Quem chega perto do mínimo recebe pontuação proporcional, para que dois meses de
diferença não descartem um bom candidato.

Em "Detalhes" você vê o trecho exato do currículo que fez cada critério bater —
serve para conferir a nota antes de confiar nela.

## Mensagem do convite

O texto aceita três marcadores, trocados na hora de abrir o WhatsApp:

- `{primeiroNome}` — Mariana
- `{nome}` — Mariana Alves de Souza
- `{vaga}` — o título da vaga

Quem já foi convidado fica marcado na lista (o registro fica no navegador, por
vaga), e dá para esconder essas pessoas com um filtro enquanto você trabalha o
resto da fila.

## Análise por IA (opcional)

A pontuação por critérios é literal: ela vê a palavra, não o sentido. Quem
escreveu "responsável pelo fechamento mensal das contas do prédio" sabe fazer
conciliação sem nunca ter usado a palavra.

Para esses casos existe um segundo parecer, lido por IA, com resumo, pontos
fortes, pontos de atenção e perguntas para a entrevista. Ele **não substitui** a
nota objetiva: as duas ficam lado a lado.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Sem a chave, o botão fica desabilitado e o resto funciona normalmente. A análise
é cobrada por currículo, então use nos finalistas, não no lote inteiro — o botão
"Analisar visíveis com IA" respeita os filtros da tela justamente para isso.

Variáveis aceitas:

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Habilita a análise por IA |
| `TRIAGEM_ESFORCO_IA` | Profundidade da análise: `low`, `medium` (padrão), `high` |
| `PORT` | Porta do servidor (padrão `5199`) |
| `TRIAGEM_SEM_NAVEGADOR` | Não abrir o navegador sozinho |

## Quando algo não é lido

| Sintoma | Motivo e saída |
|---|---|
| "PDF sem camada de texto" | O PDF é uma imagem digitalizada. Precisa passar por OCR antes. |
| "Formato .doc não é lido" | Word 97-2003. Abra e salve como `.docx` ou PDF. |
| "Nome não identificado" | O currículo começa com um cabeçalho fora do comum. O nome do arquivo é usado como segunda opção; confira em "Detalhes". |
| "Sem telefone no currículo" | Não havia número em formato brasileiro reconhecível. O texto extraído está em "Detalhes". |

Um arquivo ilegível nunca derruba o lote: ele aparece na lista marcado como não
lido, com o motivo.

## Privacidade

Currículo é dado pessoal de terceiro. Por isso:

- o servidor escuta só em `127.0.0.1` — não fica exposto na rede local;
- nenhum arquivo é gravado em disco; o texto vive na aba do navegador e some
  quando ela fecha;
- `curriculos/` está no `.gitignore` — se você deixar os arquivos por perto para
  arrastar, eles não vão para o repositório por acidente;
- o texto do currículo só sai da máquina quando você pede a análise por IA.
