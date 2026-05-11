import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class UpdateParsedReportDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsUUID()
  outletId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsDateString()
  reportDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  locationRaw?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  nameRaw?: string | null;
}
