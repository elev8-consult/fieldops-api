import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';

export class ImportCatalogDto {
  /** The brand every row in the uploaded file belongs to. */
  @IsUUID()
  brandId: string;

  /**
   * When 'true', parse and report what would happen without writing
   * anything to the database. Multipart form fields arrive as strings,
   * so this is validated as a boolean-ish string.
   */
  @IsOptional()
  @IsBooleanString()
  dryRun?: string;
}

export type ImportRowStatus = 'created' | 'updated' | 'skipped' | 'conflict';

export interface ImportRowResult {
  row: number;
  productName: string | null;
  sku: string | null;
  barcode: string | null;
  status: ImportRowStatus;
  productId?: string | null;
  reason?: string;
}

export interface ImportCatalogResult {
  brandId: string;
  dryRun: boolean;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  rows: ImportRowResult[];
}
