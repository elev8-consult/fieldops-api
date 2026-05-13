import { IsNotEmpty, IsString } from 'class-validator';

export class MatchBrandDto {
  @IsString()
  @IsNotEmpty()
  brand_raw: string;
}
