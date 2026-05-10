import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ParsedReportStatus } from '../../../common/enums/schema.enums';

function toArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

export class DashboardFilterDto {
  @IsUUID('4')
  brand_id: string;

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsIn(Object.values(ParsedReportStatus), { each: true })
  status?: ParsedReportStatus[];

  @IsOptional()
  @IsUUID('4')
  outlet_id?: string;

  @IsOptional()
  @IsUUID('4')
  reported_by?: string;
}
