import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from '../messages/entities/whatsapp-message.entity';
import { ParsedReport } from './entities/parsed-report.entity';
import { ReportFlag } from './entities/report-flag.entity';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParsedReport, ReportFlag, WhatsappMessage])],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
