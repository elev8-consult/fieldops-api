import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PromoterDashboardService } from './promoter-dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PromoterDashboardService],
})
export class DashboardModule {}
