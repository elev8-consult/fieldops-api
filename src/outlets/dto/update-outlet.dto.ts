import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const OUTLET_TYPES = [
  'supermarket',
  'minimarket',
  'hypermarket',
  'depot',
  'other',
] as const;

export class UpdateOutletDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn([...OUTLET_TYPES])
  type?: (typeof OUTLET_TYPES)[number];

  @IsOptional()
  @IsBoolean()
  isDepot?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  regionId?: number;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
