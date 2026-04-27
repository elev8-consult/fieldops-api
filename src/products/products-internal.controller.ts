import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsInternalController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('match')
  @UseGuards(InternalApiKeyGuard)
  matchProducts(
    @Body() body: { brandId: string; items: { product_name_raw: string }[] },
  ) {
    return this.productsService.matchProductBatch(body.brandId, body.items ?? []);
  }
}
