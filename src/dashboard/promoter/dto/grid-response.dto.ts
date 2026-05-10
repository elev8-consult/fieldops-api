export interface GridProductDto {
  id: string;
  canonical_name: string;
  is_offer: boolean;
}

export interface GridRowDto {
  outlet_id: string;
  outlet_name: string;
  outlet_type: string;
  region_name: string | null;
  has_flags: boolean;
  pending_review: boolean;
  flag_messages: string[];
  cells: Record<string, Record<string, number>>;
  palette: Record<string, number>;
  gifts: Record<string, number>;
  row_total: number;
}

export interface GridResponseDto {
  dates: string[];
  products: GridProductDto[];
  rows: GridRowDto[];
  column_totals: Record<string, number> & {
    palette: number;
    gifts: number;
    grand_total: number;
  };
}
