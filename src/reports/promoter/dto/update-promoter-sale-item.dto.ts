import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePromoterSaleItemDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsUUID()
  productId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  quantity?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  promoLabel?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsBoolean()
  isOffer?: boolean;
}
