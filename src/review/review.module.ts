import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from '../messages/entities/whatsapp-message.entity';
import { ProductsModule } from '../products/products.module';
import { ParsedReport } from './entities/parsed-report.entity';
import { ReportFlag } from './entities/report-flag.entity';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ParsedReport, ReportFlag, WhatsappMessage]),
    ProductsModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
