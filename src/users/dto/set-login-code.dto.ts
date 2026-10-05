import { IsOptional, Matches } from 'class-validator';

export class SetLoginCodeDto {
  /** Omit to generate a random 6-digit code. The mobile app accepts 4–6 digits. */
  @IsOptional()
  @Matches(/^\d{4,6}$/, { message: 'PIN must be 4 to 6 digits' })
  code?: string;
}
