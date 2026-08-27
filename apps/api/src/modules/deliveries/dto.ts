import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDeliveryDto {
  @IsString() unitId!: string;

  @IsString() @MinLength(2) @MaxLength(80)
  carrier!: string;

  @IsString() @MaxLength(60)
  trackingCode!: string;

  @IsIn(['pequena', 'media', 'grande'])
  size!: 'pequena' | 'media' | 'grande';

  @IsString() @MaxLength(20)
  shelf!: string;

  @IsOptional() @IsBoolean()
  requiresSignature?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;
}

export class PickupDeliveryDto {
  @IsString() @MinLength(3) @MaxLength(120)
  pickedUpBy!: string;
}
