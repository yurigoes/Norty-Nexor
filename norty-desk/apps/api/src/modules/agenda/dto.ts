import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class BuscarAgendaDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  /** Ids separados por vírgula. Sem eles nem time, a agenda de quem pede. */
  @IsOptional() @IsString() @MaxLength(2000) userIds?: string;
  @IsOptional() @IsUUID() teamId?: string;
}

export class EventoDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(200) location?: string | null;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsBoolean() isPrivate?: boolean;
  /** De quem é o compromisso. Ausente = de quem marca. */
  @IsOptional() @IsUUID() ownerId?: string;
}

export class EditarEventoDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(200) location?: string | null;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsBoolean() isPrivate?: boolean;
}
