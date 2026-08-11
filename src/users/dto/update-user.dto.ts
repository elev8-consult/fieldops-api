import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

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
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Replaces the user's full outlet assignment list when provided. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  outletIds?: string[];
}
