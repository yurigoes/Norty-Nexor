# 05 — SLA, calendário, pendência e escalonamento

O cálculo é o do GLPI. O que muda é onde o estado mora
(`docs/02-gap-analysis.md`, item 5).

---

## 1. Vocabulário

| Termo | O que é | Com quem |
|---|---|---|
| **SLA** | Compromisso com o cliente | externo |
| **OLA** | Compromisso interno entre times | interno |
| **TTO** (*time to own*) | Prazo até o primeiro atendimento | ambos |
| **TTR** (*time to resolve*) | Prazo até resolver | ambos |

Quatro compromissos possíveis por chamado. Nenhum é obrigatório.

## 2. Como um compromisso nasce

Na abertura, depois das regras de entrada:

1. A categoria do chamado indica `defaultAgreementId`, ou uma
   `IntakeRule` define o acordo.
2. Para cada `Agreement` aplicável, cria-se um `SlaCommitment` com
   `startedAt = agora` e `dueAt = calcularVencimento(...)`.
3. `@@unique([ticketId, kind, target])` impede dois compromissos do
   mesmo tipo — reclassificar substitui, não acumula.

## 3. O cálculo do vencimento

Equivalente a `LevelAgreement::computeExecutionDate()` do GLPI.

Um prazo é **segundos de expediente**, não de relógio. Um TTR de 4 horas
aberto às 17h de uma sexta, num calendário 9h–18h de segunda a sexta,
vence às 12h da segunda seguinte.

```
calcularVencimento(inicio, duracaoSegundos, calendario):
  restante = duracaoSegundos
  cursor   = inicio
  enquanto restante > 0:
    faixa = proximaFaixaDeExpediente(cursor, calendario)
      # pula fins de semana, feriados e horas fora do expediente
    disponivel = segundos(cursor .. fim(faixa))
    se disponivel >= restante:
      devolve cursor + restante
    restante -= disponivel
    cursor = inicio(proximaFaixa)
```

Detalhes que importam:

- **Fuso.** `Calendar.timezone` (padrão `America/Sao_Paulo`). Todo
  `DateTime` no banco é UTC; a conversão acontece só aqui.
- **Feriado recorrente.** `Holiday.isRecurring` compara dia e mês,
  ignorando o ano.
- **Calendário vazio.** Sem faixas, o prazo é corrido (24×7). É o
  comportamento certo para plantão.
- **Sem calendário.** `Agreement.calendarId` nulo também significa 24×7.

## 4. Quando o relógio para

Dois status param o relógio, e a lista deles é dado, não `if`:
`STATUS_QUE_PARAM_O_RELOGIO`, em `packages/shared/src/domain.ts`.

| Status | Quem está segurando | Cobra o cliente? |
|---|---|---|
| `PENDENTE` | o cliente, que deve retorno | sim |
| `EM_APROVACAO` | o gestor, que deve a decisão | não |

`SOLUCIONADO` e `FECHADO` ficam de fora de propósito: ali o compromisso
já foi cumprido ou já foi perdido, e não há prazo correndo para parar.

Isso veio do OCOMON, que tem a mesma ideia como coluna
(`status.stat_time_freeze`): o estado diz se o relógio anda. A alternativa
— espalhar `if (status === 'PENDENTE')` pelo código — foi o que tínhamos,
e custou caro: quando a aprovação nasceu, ninguém lembrou de incluí-la, e
um chamado esperando o aval do gestor queimava SLA que aparecia no
relatório da equipe de atendimento, que não tinha o que fazer a respeito.

### Os dois campos, e por que não é um só

- `ticket.pendingSince` — "estou esperando **o cliente**". Só a pendência
  o escreve, e é dele que sai a cobrança automática da seção 5.
- `ticket.clockStoppedAt` — "o relógio não corre". Vale nos dois status,
  e é dele que sai o desconto.

Num chamado pendente os dois coincidem. Na aprovação só o segundo existe
— cobrar o cliente porque o gestor da nossa casa não decidiu seria
absurdo.

### O ponto único

Toda mudança de status passa por `SlaService.aoMudarStatus(de, para)`:

```
corre -> para:  ticket.clockStoppedAt = agora   (só se ainda for nulo)
para  -> corre: parado = segundosDeExpediente(clockStoppedAt .. agora, cal)
                para cada compromisso em aberto:
                  compromisso.pausedSeconds += parado
                  compromisso.dueAt = calcularVencimento(dueAt, parado, cal)
                ticket.clockStoppedAt = null
                registra evento RETOMADA_SLA
para  -> para:  nada. PENDENTE -> EM_APROVACAO não reinicia a contagem,
                senão o tempo já parado voltaria a contar como atendimento
corre -> corre: nada
```

O `só se ainda for nulo` e o `para -> para: nada` são a mesma defesa
escrita duas vezes, e as duas valem: uma segunda parada sem retomada
entre elas perderia a primeira.

O tempo parado também é medido em expediente. Um chamado parado da sexta
à noite até a segunda de manhã não ganha 60 horas de folga — ganha zero.

Isso corresponde a `sla_waiting_duration` / `ola_waiting_duration` /
`begin_waiting_date` do GLPI, com a diferença de estarem numa linha por
compromisso, não em colunas do chamado.

## 5. Motivos de pendência com cobrança automática

`PendingReason` é um recurso do GLPI que a maioria dos usuários não
conhece e que resolve um problema real: chamado parado esperando o
cliente, para sempre.

| Campo | Efeito |
|---|---|
| `followupIntervalSeconds` | de quanto em quanto tempo cobrar. `0` desliga |
| `followupsBeforeResolution` | quantas cobranças antes de resolver sozinho. `0` nunca resolve |
| `followupTemplate` | corpo da cobrança |

O cron `CobrancaPendenciaJob` roda a cada 15 minutos:

```
para cada chamado PENDENTE com motivo que tem intervalo:
  se agora - ultimaCobranca >= intervalo:
    envia cobrança pelo canal de origem do chamado
    ticket.pendingRemindersSent += 1
    se pendingRemindersSent >= followupsBeforeResolution > 0:
      resolve o chamado com solução automática
      registra evento SOLUCAO com autor = sistema
```

A cobrança sai pelo canal em que o solicitante falou. Quem abriu por
WhatsApp é cobrado no WhatsApp.

## 6. Escalonamento

`EscalationLevel` substitui `SlaLevel` + `OlaLevel` + critérios + ações
(seis tabelas do GLPI). Cada nível tem:

- `offsetSeconds` — deslocamento relativo ao vencimento. Negativo
  dispara antes (`-1800` = 30 minutos antes), positivo depois
  (`3600` = 1 hora de atraso).
- `criteria` (JSONB, opcional) — só dispara se o chamado casar.
- `actions` (JSONB) — o que fazer.

Ações previstas:

```ts
type EscalationAction =
  | { tipo: 'NOTIFICAR'; alvo: 'ATRIBUIDO' | 'TIME' | 'SUPERVISOR' | 'REQUERENTE' }
  | { tipo: 'AUMENTAR_URGENCIA'; para: 1|2|3|4|5 }
  | { tipo: 'ATRIBUIR_TIME'; teamId: string }
  | { tipo: 'MARCAR'; etiqueta: string }
  | { tipo: 'WEBHOOK'; webhookId: string };
```

O cron `EscalonamentoJob` roda a cada minuto sobre o índice
`@@index([dueAt, achievedAt])`:

```sql
SELECT * FROM sla_commitments
WHERE achievedAt IS NULL
  AND dueAt + (offsetSeconds || ' seconds')::interval <= now()
  AND escalationLevel < :nivel
```

`escalationLevel` no compromisso impede disparo repetido do mesmo nível.

## 7. Cumprimento e violação

| Compromisso | Cumprido quando | Violado quando |
|---|---|---|
| TTO | primeiro evento `MENSAGEM` público de um agente | `dueAt` passa sem isso |
| TTR | status vai para `SOLUCIONADO` ou `FECHADO` | `dueAt` passa sem isso |

`achievedAt` e `breachedAt` são gravados uma única vez, no momento do
fato. Relatório de SLA lê essas duas colunas — nunca recalcula prazo
histórico. Mudar o acordo hoje não pode reescrever o desempenho de
ontem.

`Ticket.firstResponseAt` é redundante com o TTO e existe de propósito:
permite medir primeira resposta mesmo em chamado sem acordo.

## 8. O que muda para quem vem do GLPI

| | GLPI | Desk |
|---|---|---|
| Estado do SLA | 17 colunas em `glpi_tickets` | linhas em `sla_commitments` |
| Níveis de escalonamento | 6 tabelas | 1 com JSONB |
| Cálculo sobre calendário | `computeExecutionDate()` | **igual** |
| Desconto de pendência | `sla_waiting_duration` | **igual**, por compromisso |
| Cobrança automática | `PendingReasonCron` | **igual**, pelo canal de origem |
| Terceiro tipo de prazo | `ALTER TABLE` | valor de enum |
