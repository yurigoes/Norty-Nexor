import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ASSET_KINDS, type AssetKind } from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class EscreverLocalizacaoDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() parentId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EscreverFabricanteDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

export class EscreverModeloDeAtivoDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsIn(ASSET_KINDS) kind?: AssetKind;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() manufacturerId?: string | null;
}
