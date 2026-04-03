import { IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePromoterReportDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  promoStandPlacement?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  personsContacted?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  personsTasted?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  feedbackText?: string | null;
}
