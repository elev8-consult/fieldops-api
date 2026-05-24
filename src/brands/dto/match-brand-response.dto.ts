export interface BrandMatchSuggestion {
  brand_id: string;
  brand_name: string;
  confidence: number;
}

export interface MatchBrandResponseDto {
  brand_id: string | null;
  brand_name: string | null;
  match_confidence: number;
  match_type: 'exact' | 'normalized' | 'fuzzy' | 'ilike' | 'none';
  suggestions: BrandMatchSuggestion[];
  error?: 'match_unavailable';
  message?: string;
}
