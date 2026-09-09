import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TICKET_STATUSES } from '@norty-desk/shared';

export class AcaoEmLoteDto {
  @IsIn(['ATRIBUIR', 'CLASSIFICAR', 'MUDAR_STATUS'])
  tipo!: 'ATRIBUIR' | 'CLASSIFICAR' | 'MUDAR_STATUS';

  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() categoryId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) urgency?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number;

  @IsOptional() @IsIn(TICKET_STATUSES) status?: (typeof TICKET_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
}

export class LoteDto {
  /**
   * O teto de 200 não é arbitrário: acima disso a requisição estoura o
   * tempo do proxy e o agente fica sem saber o que passou. Lote maior
   * se faz em duas vezes, e o resultado por item diz onde parou.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ticketIds!: string[];

  @ValidateNested()
  @Type(() => AcaoEmLoteDto)
  acao!: AcaoEmLoteDto;
}
