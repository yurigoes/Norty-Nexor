import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class BaterPontoDto {
  /** O chamado com o chat aberto. Omitido = online, sem conversa. */
  @IsOptional() @IsUUID() ticketId?: string | null;

  @IsOptional() @IsBoolean() digitando?: boolean;
}
