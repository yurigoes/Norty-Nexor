import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ASSET_KINDS, ASSET_STATUSES, COMPONENT_KINDS, type ComponentKind } from '@norty-desk/shared';

/**
 * Teto do `data:` da assinatura, em caracteres.
 *
 * O limite de verdade é o de `assinaturaInvalida`, em bytes, no domínio
 * compartilhado. Este aqui só evita que um corpo absurdo chegue a ser
 * decodificado — base64 cresce um terço, daí a folga.
 */
const TETO_DA_ASSINATURA = 4 * 1024 * 1024;

/**
 * Booleano vindo da query.
 *
 * `Boolean('false')` é `true`, e é assim que um filtro de "só os que
 * não têm" passa a devolver o contrário do pedido.
 */
const booleano = ({ value }: { value: unknown }) => value === true || value === 'true';

/** Campo de texto opcional que aceita `null` para limpar. */
const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class EscreverAtivoDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;

  /**
   * De qual empresa-cliente é o equipamento. `null` é da casa.
   *
   * É o campo que o agente de inventário preenche antes de varrer a
   * máquina: sem ele, o que a varredura encontra cai num parque só, e
   * "quantas máquinas a empresa do João tem?" deixa de ter resposta.
   */
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() clientId?: string | null;

  @IsOptional() @IsIn(ASSET_KINDS) kind?: (typeof ASSET_KINDS)[number];
  @IsOptional() @IsIn(ASSET_STATUSES) status?: (typeof ASSET_STATUSES)[number];

  // Etiqueta e série em branco viram `null`: string vazia colidiria no
  // índice único, e o CHECK do banco a recusaria com erro feio.
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(80) tag?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(120) serialNumber?: string | null;

  // Fabricante, modelo e localização vêm do catálogo: texto livre era a
  // origem da sujeira de inventário — "HP", "hp" e "Hewlett-Packard" são
  // três fabricantes para quem conta e um só para quem olha.
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() manufacturerId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assetModelId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() locationId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;

  /**
   * Em qual equipamento este periférico pendura. `null` despendura.
   *
   * Um nível só: o serviço recusa pendurar num ativo que já tem pai.
   */
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() parentAssetId?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() purchasedAt?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() warrantyUntil?: string | null;
}

export class EditarAtivoDto extends EscreverAtivoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare name: string;
}

export class BuscarAtivosDto {
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  /** Só o parque desta empresa. */
  @IsOptional() @IsUUID() clientId?: string;
  /** Só o que é da casa — o que nenhuma empresa-cliente reivindica. */
  @IsOptional() @Transform(booleano) @IsBoolean() semCliente?: boolean;
  /** Só os periféricos pendurados neste equipamento. */
  @IsOptional() @IsUUID() parentAssetId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsIn(ASSET_KINDS) kind?: (typeof ASSET_KINDS)[number];
  @IsOptional() @IsIn(ASSET_STATUSES) status?: (typeof ASSET_STATUSES)[number];
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class VincularAtivoDto {
  @IsUUID() assetId!: string;
}

/**
 * Entregar o equipamento a alguém.
 *
 * A assinatura é o termo de compromisso, desenhado na tela como na ordem
 * de serviço. Opcional porque nem toda entrega acontece com a pessoa na
 * frente — e recusar a entrega sem termo empurraria o gesto para fora do
 * sistema: o equipamento sai na mesma, e aí some do inventário também.
 */
export class EntregarAtivoDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(TETO_DA_ASSINATURA) signature?: string;
  @IsOptional() @IsString() @MaxLength(200) signedByName?: string;
}

export class DevolverAtivoDto {
  /** Guardar ou descartar: é o que o equipamento vira ao voltar. */
  @IsIn(['EM_ESTOQUE', 'BAIXADO']) returnedTo!: 'EM_ESTOQUE' | 'BAIXADO';
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ResponderPesquisaDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) score!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

/**
 * Uma peça dentro do equipamento.
 *
 * `attributes` chega como objeto solto de propósito: o que vale nele
 * muda com o `kind`, e quem decide isso é `validarAtributos`, em
 * `packages/shared` — a mesma ficha que a tela desenha. Um DTO com
 * dezessete formatos não teria como ser lido pelos dois lados.
 */
export class EscreverComponenteDto {
  @IsIn(COMPONENT_KINDS) kind!: ComponentKind;
  @IsString() @MinLength(1) @MaxLength(160) name!: string;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() manufacturerId?: string | null;
  @IsOptional()
  @Transform(vazioVirandoNulo)
  @IsString()
  @MaxLength(120)
  serialNumber?: string | null;
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EditarComponenteDto extends EscreverComponenteDto {
  @IsOptional() @IsIn(COMPONENT_KINDS) declare kind: ComponentKind;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) declare name: string;
}
