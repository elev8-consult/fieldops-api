import { IsInt, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePromoterSampleItemDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsUUID('4')
  productId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  quantity?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  availabilityNote?: string | null;
}
