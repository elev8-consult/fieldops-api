import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

const FLOWS = ['merchandiser', 'promoter', 'both'] as const;

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  canonicalName?: string;

  @IsOptional()
  @IsString()
  sku?: string | null;

  /** Digits only, or null/empty to clear. */
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(/^\d{8,14}$/, {
    message: 'Barcode must be 8–14 digits',
  })
  barcode?: string | null;

  @IsOptional()
  @IsIn([...FLOWS])
  flow?: (typeof FLOWS)[number];

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
