import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum OutletType {
  SUPERMARKET = 'supermarket',
  MINIMARKET = 'minimarket',
  HYPERMARKET = 'hypermarket',
  DEPOT = 'depot',
  OTHER = 'other',
}

export class CreateOutletDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(OutletType)
  type: OutletType;

  @IsOptional()
  @IsBoolean()
  is_depot?: boolean;

  @IsOptional()
  @IsUUID()
  region_id?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
