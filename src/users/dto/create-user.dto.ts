import {
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

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(ROLES)
  role: (typeof ROLES)[number];

  @IsOptional()
  @IsUUID('4')
  brandId?: string | null;
}
