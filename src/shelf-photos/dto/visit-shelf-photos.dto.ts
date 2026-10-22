import { IsUUID } from 'class-validator';

export class VisitShelfPhotosDto {
  @IsUUID()
  outletId: string;
}
