import {
  Body,
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { MatchErrorStatusInterceptor } from '../common/interceptors/match-error-status.interceptor';
import { MatchProductsDto } from './dto/match-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsInternalController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('match')
  @UseGuards(InternalApiKeyGuard)
  @UseInterceptors(MatchErrorStatusInterceptor)
  matchProducts(@Body() dto: MatchProductsDto) {
    return this.productsService.matchProducts(dto);
  }
}
