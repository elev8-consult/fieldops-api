import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class MerchandiserDashboardQueryDto {
  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.brandId)
  @Transform(({ value }) => (value == null || value === '' ? undefined : String(value)))
  @IsUUID()
  brand_id?: string;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.dateFrom)
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.dateTo)
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') return undefined;
    return String(value);
  })
  @IsUUID()
  outlet_id?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') return undefined;
    return String(value);
  })
  @IsUUID()
  reported_by?: string;
}
