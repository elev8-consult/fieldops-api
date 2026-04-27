import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductAlias } from './entities/product-alias.entity';
import { Product } from './entities/product.entity';
import { ProductsInternalController } from './products-internal.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductAlias])],
  controllers: [ProductsController, ProductsInternalController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
