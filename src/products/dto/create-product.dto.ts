import { IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const FLOWS = ['merchandiser', 'promoter', 'both'] as const;

export class CreateProductDto {
  @Type(() => Number)
  @IsInt()
  brandId: number;

  @IsString()
  @MinLength(1)
  canonicalName: string;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsIn([...FLOWS])
  flow: (typeof FLOWS)[number];

  @IsOptional()
  @IsString()
  unit?: string | null;
}
