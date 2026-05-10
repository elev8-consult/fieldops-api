import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const ALLOWED_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'reviewed',
] as const;

function toStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    if (value.includes(',')) {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [value];
  }
  return [String(value)];
}

export class PromoterDashboardQueryDto {
  @IsOptional()
  @IsUUID('4')
  brand_id?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ALLOWED_STATUSES, { each: true })
  status?: Array<(typeof ALLOWED_STATUSES)[number]>;

  @IsOptional()
  @IsUUID('4')
  outlet_id?: string;

  @IsOptional()
  @IsUUID('4')
  reported_by?: string;
}

export const promoterDashboardAllowedStatuses = ALLOWED_STATUSES;
