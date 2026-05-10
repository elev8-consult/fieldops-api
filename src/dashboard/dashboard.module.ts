import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PromoterDashboardModule } from './promoter/promoter-dashboard.module';

@Module({
  imports: [PromoterDashboardModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
