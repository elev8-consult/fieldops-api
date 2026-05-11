import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { MatchProductsDto } from './dto/match-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsInternalController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('match')
  @UseGuards(InternalApiKeyGuard)
  matchProducts(@Body() dto: MatchProductsDto) {
    return this.productsService.matchProducts(dto);
  }
}
