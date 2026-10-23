# Norty Car — Uso em campo (PWA) e plano de trabalho offline

## O que já funciona

- Aplicativo instalável (manifest + service worker) e responsivo, com telas de
  campo pensadas para celular: vistoria em etapas com câmera traseira por item,
  mapa de avarias por toque, assinatura no dedo, consulta de placa e de OS,
  movimentação de estoque.
- O service worker guarda **só a casca** do aplicativo (HTML, JS, CSS, fontes)
  para abrir rápido. **Nenhum dado de API fica no aparelho.**

## O que NÃO é prometido ainda

Trabalho sem sinal (preencher vistoria offline e sincronizar depois) não está
implementado. Abaixo, o desenho para implementar com segurança.

## Desenho do modo offline (vistoria)

1. **Escopo fechado.** Só a vistoria em rascunho do próprio vistoriador e as
   fotos dela. Nada de listas de clientes ou contratos no aparelho.
2. **Armazenamento local controlado.** IndexedDB com os dados da vistoria
   cifrados por uma chave derivada da sessão (WebCrypto), apagados ao
   sincronizar ou no logout. Fotos como Blob, com limite de tamanho total.
3. **Identidade estável.** A vistoria recebe um UUID gerado no aparelho e uma
   `idempotencyKey`; o servidor aceita o mesmo envio repetido sem duplicar.
4. **Fila de sincronização.** Ao voltar o sinal: cria a vistoria (ou recupera
   pelo UUID), envia fotos uma a uma (cada upload idempotente pelo sha256 +
   vistoria), envia itens e avarias, e só então conclui. Falha no meio deixa a
   vistoria em rascunho no servidor, nunca concluída pela metade.
5. **Conflitos.** O servidor é a autoridade: se a vistoria já foi concluída por
   outra pessoa, o rascunho local vira "conflito" e é mostrado para decisão
   humana; nada é sobrescrito. Hodômetro menor que o último registrado é
   sinalizado.
6. **Evidência.** Hora de captura da foto e hora de envio são guardadas
   separadamente; a conclusão registra que houve preenchimento offline.

Critério para considerar pronto: testes automatizados da fila (reenvio,
queda no meio do envio, conflito) e teste manual em aparelho com modo avião.
