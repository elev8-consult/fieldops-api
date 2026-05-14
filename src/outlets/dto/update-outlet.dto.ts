import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { OutletType } from './create-outlet.dto';

export class UpdateOutletDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(OutletType)
  type?: OutletType;

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
