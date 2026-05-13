import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { MatchBrandDto } from './dto/match-brand.dto';
import type { MatchBrandResponseDto } from './dto/match-brand-response.dto';
import { BrandsService } from './brands.service';

@Controller('brands')
export class BrandsInternalController {
  constructor(private readonly brandsService: BrandsService) {}

  @Post('match')
  @UseGuards(InternalApiKeyGuard)
  matchBrand(@Body() dto: MatchBrandDto): Promise<MatchBrandResponseDto> {
    return this.brandsService.matchBrand(dto.brand_raw);
  }
}
