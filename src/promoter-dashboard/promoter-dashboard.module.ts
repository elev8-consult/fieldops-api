import { Module } from '@nestjs/common';
import { PromoterDashboardController } from './promoter-dashboard.controller';
import { PromoterDashboardService } from './promoter-dashboard.service';

@Module({
  controllers: [PromoterDashboardController],
  providers: [PromoterDashboardService],
})
export class PromoterDashboardModule {}
