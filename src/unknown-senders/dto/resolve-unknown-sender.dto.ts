import { IsUUID } from 'class-validator';

export class ResolveUnknownSenderDto {
  @IsUUID('4')
  brand_id: string;
}
