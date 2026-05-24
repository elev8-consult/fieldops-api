import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MatchProductItemDto {
  @IsString()
  product_name_raw: string;
}

export class MatchProductsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  brandId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  brandRaw?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchProductItemDto)
  items: MatchProductItemDto[];
}

export interface MatchSuggestion {
  product_id: string;
  canonical_name: string;
  confidence: number;
}

export interface MatchResult {
  product_name_raw: string;
  product_id: string | null;
  canonical_name: string | null;
  match_confidence: number;
  match_type: 'exact' | 'alias' | 'fuzzy' | 'ilike' | 'none';
  suggestions: MatchSuggestion[];
}

export interface MatchProductsResponse {
  results: MatchResult[];
  error?: 'match_unavailable';
  message?: string;
}
