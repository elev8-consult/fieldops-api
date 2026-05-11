import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class MatchOutletDto {
  @IsString()
  @IsNotEmpty()
  location_raw: string;

  @IsOptional()
  @IsUUID()
  brand_id?: string;
}
