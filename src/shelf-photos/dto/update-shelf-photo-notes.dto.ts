import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateShelfPhotoNotesDto {
  @IsUUID()
  outletId: string;

  @IsUUID()
  brandId: string;

  @IsOptional()
  @IsUUID()
  shelfId?: string;

  @IsIn(['before', 'after'])
  kind: 'before' | 'after';

  @IsString()
  @MaxLength(500)
  notes: string;
}
