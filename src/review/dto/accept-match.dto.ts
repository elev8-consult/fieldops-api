import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export const MATCH_REPORT_TYPES = [
  'merchandiser',
  'promoter_sale',
  'promoter_sample',
] as const;

export type MatchReportType = (typeof MATCH_REPORT_TYPES)[number];

export class AcceptMatchDto {
  @IsUUID()
  productId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  rawName: string;

  @IsIn(MATCH_REPORT_TYPES)
  reportType: MatchReportType;
}
