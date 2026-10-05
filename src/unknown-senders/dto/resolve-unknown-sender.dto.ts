import { IsUUID } from 'class-validator';

export class ResolveUnknownSenderDto {
  @IsUUID()
  brand_id: string;
}
