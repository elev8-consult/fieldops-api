import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const FLOWS = ['merchandiser', 'promoter', 'both'] as const;

export class UpdateProductDto {
  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  canonicalName?: string;

  @IsOptional()
  @IsString()
  sku?: string | null;

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
