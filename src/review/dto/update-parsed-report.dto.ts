import { IsDateString, IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateParsedReportDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  outletId?: number | null;

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
