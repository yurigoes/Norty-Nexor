-- A mudança tem linha do tempo própria, e o status dela é `ChangeStatus`.
-- Mesma decisão do problema: tipo de evento próprio em vez de alargar
-- `MUDANCA_STATUS`.
ALTER TYPE "EventType" ADD VALUE 'MUDANCA_STATUS_MUDANCA';
