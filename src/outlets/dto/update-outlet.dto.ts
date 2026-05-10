import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

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
  @IsUUID('4')
  regionId?: string;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
