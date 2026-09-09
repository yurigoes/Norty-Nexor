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
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class SolicitarAprovacaoDto {
  /**
   * Quem decide esta etapa. Uma linha por pessoa: a decisão é
   * individual, e o histórico precisa dizer quem aprovou o quê.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  approverIds!: string[];

  /** Quantos "sim" a etapa precisa. Padrão: todos. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quorum?: number;

  /**
   * A etapa. Omitida, entra depois da última existente — que é o que
   * se quer ao encadear "gerente, depois diretor".
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  step?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class DecidirAprovacaoDto {
  @IsIn(['APROVADO', 'RECUSADO'])
  decision!: 'APROVADO' | 'RECUSADO';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
