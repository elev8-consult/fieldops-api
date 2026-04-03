import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const ROLES = [
  'super_admin',
  'brand_manager',
  'supervisor',
  'promoter',
  'merchandiser',
  'reviewer',
] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  brandId?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
