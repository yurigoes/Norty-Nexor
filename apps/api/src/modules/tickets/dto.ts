import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const PRIORITIES = ['baixa', 'normal', 'alta', 'urgente'] as const;
const STATUSES = ['aberto', 'em_andamento', 'resolvido', 'cancelado'] as const;

export class CreateTicketDto {
  @IsString() @MaxLength(60)
  category!: string;

  @IsString() @MaxLength(120)
  location!: string;

  @IsString() @MinLength(4) @MaxLength(160)
  title!: string;

  @IsString() @MinLength(4) @MaxLength(2000)
  description!: string;

  @IsIn(PRIORITIES)
  priority!: (typeof PRIORITIES)[number];

  @IsOptional() @IsString()
  unitId?: string;
}

export class AddTicketUpdateDto {
  @IsString() @MinLength(3) @MaxLength(1000)
  message!: string;

  @IsOptional() @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional() @IsString() @MaxLength(120)
  assignedTo?: string;
}
