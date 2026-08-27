import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateReservationDto {
  @IsString() areaId!: string;

  @IsDateString({}, { message: 'Informe a data da reserva.' })
  date!: string;

  @Matches(/^\d{2}:\d{2}( ?[-–] ?\d{2}:\d{2})?$/, { message: 'Horário inválido.' })
  slot!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(500)
  guests!: number;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;

  @IsOptional() @IsString()
  unitId?: string;
}
