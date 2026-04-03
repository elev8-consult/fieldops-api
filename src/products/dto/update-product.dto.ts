import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const FLOWS = ['merchandiser', 'promoter', 'both'] as const;

export class UpdateProductDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  brandId?: number;

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
