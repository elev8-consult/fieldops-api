import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MerchandiserDashboardQueryDto {
  @IsString()
  @IsNotEmpty()
  brandId: string;

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
