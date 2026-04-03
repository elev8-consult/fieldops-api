import { IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMerchandiserItemDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  productId?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  quantity?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  expiryDate?: string | null;
}
