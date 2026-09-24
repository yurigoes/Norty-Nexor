-- A reserva da fila.
--
-- Nenhuma das duas colunas guarda dado do negócio: elas dizem "este
-- processo tomou esta linha para si, às tal hora". Nulo é "livre";
-- uma data velha também volta a ser livre, porque quem reservou pode
-- ter morrido no meio e reserva eterna é mensagem que ninguém
-- processa.
ALTER TABLE "inbound_messages" ADD COLUMN "claimedAt" TIMESTAMP(3);

ALTER TABLE "outbound_messages" ADD COLUMN "claimedAt" TIMESTAMP(3);
