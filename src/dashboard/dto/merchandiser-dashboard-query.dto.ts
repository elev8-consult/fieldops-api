import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class MerchandiserDashboardQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  brandId: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['approved', 'flagged', 'all'])
  status?: 'approved' | 'flagged' | 'all';
}
