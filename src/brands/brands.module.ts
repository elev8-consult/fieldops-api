import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandsInternalController } from './brands-internal.controller';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { Brand } from './entities/brand.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Brand])],
  controllers: [BrandsController, BrandsInternalController],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
