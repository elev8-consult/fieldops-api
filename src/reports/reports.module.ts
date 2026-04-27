import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { MerchandiserReportItem } from './merchandiser/entities/merchandiser-report-item.entity';
import { MerchandiserReport } from './merchandiser/entities/merchandiser-report.entity';
import { MerchandiserController } from './merchandiser/merchandiser.controller';
import { MerchandiserService } from './merchandiser/merchandiser.service';
import { PromoterReport } from './promoter/entities/promoter-report.entity';
import { PromoterSaleItem } from './promoter/entities/promoter-sale-item.entity';
import { PromoterSampleItem } from './promoter/entities/promoter-sample-item.entity';
import { PromoterController } from './promoter/promoter.controller';
import { PromoterService } from './promoter/promoter.service';

@Module({
  imports: [
    ProductsModule,
    TypeOrmModule.forFeature([
      MerchandiserReport,
      MerchandiserReportItem,
      PromoterReport,
      PromoterSaleItem,
      PromoterSampleItem,
    ]),
  ],
  controllers: [MerchandiserController, PromoterController],
  providers: [MerchandiserService, PromoterService],
})
export class ReportsModule {}
