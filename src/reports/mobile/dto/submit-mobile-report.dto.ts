import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MobileItemDto {
  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsString()
  @MinLength(1)
  productNameRaw: string;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate must be YYYY-MM-DD' })
  expiryDate?: string | null;
}

export class SubmitMobileReportDto {
  @IsUUID()
  outletId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MobileItemDto)
  items: MobileItemDto[];
}
