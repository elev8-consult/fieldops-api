import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

const FLOWS = ['merchandiser', 'promoter', 'both'] as const;

export class CreateProductDto {
  @IsUUID()
  brandId: string;

  @IsString()
  @MinLength(1)
  canonicalName: string;

  @IsOptional()
  @IsString()
  sku?: string | null;

  /** Digits only, typically EAN/UPC (8–14). */
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(/^\d{8,14}$/, {
    message: 'Barcode must be 8–14 digits',
  })
  barcode?: string | null;

  @IsIn([...FLOWS])
  flow: (typeof FLOWS)[number];

  @IsOptional()
  @IsString()
  unit?: string | null;
}
