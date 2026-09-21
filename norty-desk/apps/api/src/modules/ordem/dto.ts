import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class EscreverOrdemDto {
  @IsOptional() @IsUUID() appointmentId?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @IsString() @MaxLength(5000) report?: string;
}

export class EscreverItemDto {
  @IsString() @MinLength(1) @MaxLength(500) description!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() done?: boolean;
}

export class ReordenarDto {
  @IsInt() position!: number;
}

export class ConcluirOrdemDto {
  /**
   * PNG em `data:`, vindo do `<canvas>`.
   *
   * O limite de comprimento é generoso porque um traço de dedo em tela
   * de celular passa fácil de cem mil caracteres em base64; o limite que
   * vale é o de bytes, conferido por `assinaturaInvalida`.
   */
  @IsString() @MaxLength(1_000_000) signature!: string;

  @IsString() @MinLength(2) @MaxLength(120) signedByName!: string;
  @IsOptional() @IsString() @MaxLength(120) signedByRole?: string;
  @IsOptional() @IsString() @MaxLength(5000) report?: string;
}
