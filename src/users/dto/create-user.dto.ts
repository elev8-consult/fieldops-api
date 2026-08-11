import {
  IsArray,
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

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  /** Optional for mobile-only users (merchandiser/promoter) who log in by OTP. */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Not required for OTP (mobile) users — they have no password. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsEnum(ROLES)
  role: (typeof ROLES)[number];

  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  /** Outlets this mobile user may report on. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  outletIds?: string[];
}
