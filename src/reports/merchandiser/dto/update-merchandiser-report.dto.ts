import { IsOptional, IsString } from 'class-validator';

export class UpdateMerchandiserReportDto {
  @IsOptional()
  @IsString()
  promoType?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
