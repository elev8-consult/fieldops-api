import { IsOptional, IsUUID, Matches } from 'class-validator';

export class ListShelfPhotosDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo: string;

  @IsOptional()
  @IsUUID()
  outletId?: string;
}
