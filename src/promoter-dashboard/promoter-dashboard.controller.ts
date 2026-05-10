import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { PromoterDashboardQueryDto } from './dto/promoter-dashboard-query.dto';
import { PromoterDashboardService } from './promoter-dashboard.service';

@Controller('promoter-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromoterDashboardController {
  constructor(
    private readonly promoterDashboardService: PromoterDashboardService,
  ) {}

  @Get('summary')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  getSummary(@CurrentUser() current: JwtUser, @Query() query: PromoterDashboardQueryDto) {
    return this.promoterDashboardService.getSummary(current, query);
  }

  @Get('grid')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  getGrid(@CurrentUser() current: JwtUser, @Query() query: PromoterDashboardQueryDto) {
    return this.promoterDashboardService.getGrid(current, query);
  }

  @Get('filters')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  getFilters(@CurrentUser() current: JwtUser, @Query() query: PromoterDashboardQueryDto) {
    return this.promoterDashboardService.getFilters(current, query);
  }

  @Get('outlet/:outlet_id/reports')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  getOutletReports(
    @CurrentUser() current: JwtUser,
    @Param('outlet_id', new ParseUUIDPipe({ version: '4' })) outletId: string,
    @Query() query: PromoterDashboardQueryDto,
  ) {
    return this.promoterDashboardService.getOutletReports(current, outletId, query);
  }
}
