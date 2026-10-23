import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PageQueryDto, ToBool } from '../../common/pagination';

export const MOVEMENT_TYPES = [
  'PURCHASE_IN', 'MANUAL_IN', 'RETURN_IN', 'TRANSFER_IN', 'MAINTENANCE_OUT', 'VEHICLE_OUT', 'DRIVER_OUT', 'TRANSFER_OUT', 'LOSS', 'ADJUSTMENT',
] as const;
/** Tipos que o usuário dispara diretamente (transferência e compra têm fluxo próprio). */
export const MANUAL_MOVEMENT_TYPES = ['MANUAL_IN', 'RETURN_IN', 'MAINTENANCE_OUT', 'VEHICLE_OUT', 'DRIVER_OUT', 'LOSS', 'ADJUSTMENT'] as const;

export class CategoryDto {
  @IsString() @Length(2, 80) name!: string;
}

export class ProductDto {
  @IsString() @Length(1, 40) sku!: string;
  @IsOptional() @IsString() @MaxLength(40) barcode?: string | null;
  @IsString() @Length(2, 160) description!: string;
  @IsUUID() categoryId!: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string | null;
  @IsOptional() @IsString() @MaxLength(80) manufacturer?: string | null;
  @IsOptional() @IsString() @Length(1, 10) unit?: string;
  @IsOptional() @IsString() @MaxLength(80) reference?: string | null;
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) referencePrice?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) minStock?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) maxStock?: number | null;
  @IsOptional() @IsBoolean() trackLot?: boolean;
  @IsOptional() @IsBoolean() trackExpiry?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MaxLength(40) barcode?: string | null;
  @IsOptional() @IsString() @Length(2, 160) description?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string | null;
  @IsOptional() @IsString() @MaxLength(80) manufacturer?: string | null;
  @IsOptional() @IsString() @Length(1, 10) unit?: string;
  @IsOptional() @IsString() @MaxLength(80) reference?: string | null;
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) referencePrice?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) minStock?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) maxStock?: number | null;
  @IsOptional() @IsBoolean() trackLot?: boolean;
  @IsOptional() @IsBoolean() trackExpiry?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ProductQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @ToBool() @IsBoolean() lowStock?: boolean;
  @IsOptional() @ToBool() @IsBoolean() includeInactive?: boolean;
}

export class LocationDto {
  @IsUUID() branchId!: string;
  @IsString() @Length(2, 80) name!: string;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class MovementDto {
  @IsUUID() productId!: string;
  @IsUUID() locationId!: string;
  @IsIn(MANUAL_MOVEMENT_TYPES) type!: (typeof MANUAL_MOVEMENT_TYPES)[number];
  /** Quantidade positiva; no ajuste, com sinal (negativo baixa, positivo acrescenta). */
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(-1_000_000) @Max(1_000_000) quantity!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitCost?: number;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() workOrderId?: string;
  @IsOptional() @IsString() @MaxLength(60) lot?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsString() @Length(8, 80) idempotencyKey!: string;
}

export class TransferDto {
  @IsUUID() productId!: string;
  @IsUUID() fromLocationId!: string;
  @IsUUID() toLocationId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsString() @Length(8, 80) idempotencyKey!: string;
}

export class ReverseDto {
  @IsString() @Length(3, 500) reason!: string;
  @IsString() @Length(8, 80) idempotencyKey!: string;
}

export class MovementQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() workOrderId?: string;
  @IsOptional() @IsIn(MOVEMENT_TYPES) type?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ConsumptionQueryDto {
  @IsIn(['vehicle', 'branch', 'category', 'product']) groupBy!: 'vehicle' | 'branch' | 'category' | 'product';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

/* ---------------- Compras ---------------- */

export class PurchaseItemDto {
  @IsUUID() productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitCost!: number;
}

export class PurchaseOrderDto {
  @IsUUID() branchId!: string;
  @IsUUID() supplierId!: string;
  @IsOptional() @IsDateString() expectedAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items!: PurchaseItemDto[];
}

export class ReceiveItemDto {
  @IsUUID() itemId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitCost?: number;
}

export class ReceiveDto {
  @IsUUID() locationId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveItemDto) items!: ReceiveItemDto[];
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(60) documentNumber?: string;
  @IsString() @Length(8, 80) idempotencyKey!: string;
}

export class PurchaseQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']) status?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

/* ---------------- Inventário físico ---------------- */

export class CountOpenDto {
  @IsUUID() locationId!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CountItemDto {
  @IsUUID() productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) countedQty!: number;
}

export class CountUpdateDto {
  @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => CountItemDto) items!: CountItemDto[];
}
