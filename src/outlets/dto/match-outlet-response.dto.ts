export interface OutletMatchSuggestion {
  outlet_id: string;
  outlet_name: string;
  confidence: number;
}

export interface MatchOutletResponseDto {
  outlet_id: string | null;
  outlet_name: string | null;
  match_confidence: number;
  match_type: 'exact' | 'normalized' | 'fuzzy' | 'none';
  is_depot: boolean;
  suggestions: OutletMatchSuggestion[];
}
