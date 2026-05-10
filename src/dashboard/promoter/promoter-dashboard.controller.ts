import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { PromoterDashboardService } from './promoter-dashboard.service';

@Controller('dashboard/promoter')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromoterDashboardController {
  constructor(private readonly promoterDashboardService: PromoterDashboardService) {}

  @Get('summary')
  @Roles('super_admin', 'brand_manager', 'supervisor')
  getSummary(@CurrentUser() current: JwtUser, @Query() filter: DashboardFilterDto) {
    return this.promoterDashboardService.getSummary(current, filter);
  }

  @Get('grid')
  @Roles('super_admin', 'brand_manager', 'supervisor')
  getGrid(@CurrentUser() current: JwtUser, @Query() filter: DashboardFilterDto) {
    return this.promoterDashboardService.getGrid(current, filter);
  }

  @Get('outlet/:outlet_id/reports')
  @Roles('super_admin', 'brand_manager', 'supervisor')
  getOutletReports(
    @CurrentUser() current: JwtUser,
    @Param('outlet_id', new ParseUUIDPipe({ version: '4' })) outletId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.promoterDashboardService.getOutletReports(current, outletId, filter);
  }
}
