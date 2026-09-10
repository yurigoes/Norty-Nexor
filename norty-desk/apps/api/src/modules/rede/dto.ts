import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PORT_KINDS } from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class EscreverVlanDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(4094) tag!: number;
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EditarVlanDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4094) tag?: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EscreverSubRedeDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  /** "192.168.15.0/24". Bits de host ligados são corrigidos para a rede. */
  @IsString() @MaxLength(60) cidr!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(45) gateway?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() vlanId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EditarSubRedeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(45) gateway?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() vlanId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EscreverIpDto {
  @IsString() @MaxLength(45) address!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assetId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() portId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(253) fqdn?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EditarIpDto {
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assetId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() portId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(253) fqdn?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EscreverPortaDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsIn(PORT_KINDS) kind?: (typeof PORT_KINDS)[number];
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(30) mac?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) speedMbps?: number | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() vlanId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EditarPortaDto extends EscreverPortaDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) declare name: string;
}

export class ConectarPortaDto {
  @IsUUID() portId!: string;
}
