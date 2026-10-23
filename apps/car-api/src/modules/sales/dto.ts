import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

export class SaleQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['LISTED', 'NEGOTIATING', 'SOLD', 'WITHDRAWN']) status?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class CreateSaleDto {
  @IsUUID() vehicleUnitId!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) appraisalValue?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000) askingPrice!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minimumPrice?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) adChannels?: string[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateSaleDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) appraisalValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000) askingPrice?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minimumPrice?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) adChannels?: string[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ProposalDto {
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000) amount!: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ProposalStatusDto {
  @IsIn(['OPEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']) status!: 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
}

export class SaleExpenseDto {
  @IsString() @Length(3, 300) description!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) amount!: number;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsUUID() supplierId?: string;
}

export class WithdrawSaleDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class CloseSaleDto {
  @IsString() @Length(2, 160) buyerName!: string;
  @IsOptional() @IsString() @MaxLength(20) buyerDocument?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000) salePrice!: number;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsDateString() soldAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
