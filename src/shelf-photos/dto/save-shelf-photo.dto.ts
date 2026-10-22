import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class SaveShelfPhotoDto {
  @IsUUID()
  outletId: string;

  @IsUUID()
  brandId: string;

  /** Which shelf of this brand. Omitted photos stay on the first shelf. */
  @IsOptional()
  @IsUUID()
  shelfId?: string;

  @IsIn(['before', 'after'])
  kind: 'before' | 'after';
}
