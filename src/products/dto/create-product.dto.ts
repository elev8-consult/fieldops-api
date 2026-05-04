import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const FLOWS = ['merchandiser', 'promoter', 'both'] as const;

export class CreateProductDto {
  @IsUUID('4')
  brandId: string;

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
