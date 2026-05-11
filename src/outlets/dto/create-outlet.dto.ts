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

export class CreateOutletDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsIn([...OUTLET_TYPES])
  type: (typeof OUTLET_TYPES)[number];

  @IsOptional()
  @IsBoolean()
  isDepot?: boolean;

  @IsUUID()
  regionId: string;

  @IsOptional()
  @IsString()
  address?: string | null;
}
