-- A reserva da fila de webhook.
--
-- Mesma coluna das filas de mensagem, pelo mesmo motivo: sem ela, dois
-- processos leem a mesma entrega "PENDENTE" e o assinante recebe o
-- mesmo POST duas vezes. Nulo é "livre"; uma data velha também volta a
-- ser livre, porque quem reservou pode ter morrido no meio.
ALTER TABLE "webhook_deliveries" ADD COLUMN "claimedAt" TIMESTAMP(3);
