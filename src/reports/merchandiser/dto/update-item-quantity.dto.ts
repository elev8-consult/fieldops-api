import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateItemQuantityDto {
  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  edit_note?: string;
}
