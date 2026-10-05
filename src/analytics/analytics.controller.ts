import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { scopedBrandFilter } from '../common/brand-scope';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { parseLimit } from '../common/pagination';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @Roles('super_admin', 'brand_manager')
  summary(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.summary(
      current,
      brandId != null && brandId !== '' ? brandId : undefined,
      from,
      to,
    );
  }

  @Get('flagged-rate')
  @Roles('super_admin', 'brand_manager')
  flaggedRate(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
  ) {
    return this.analyticsService.flaggedRate(
      current,
      brandId != null && brandId !== '' ? brandId : undefined,
    );
  }

  @Get('reports-by-day')
  @Roles('super_admin', 'brand_manager')
  getReportsByDay(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getReportsByDay(
      scopedBrandFilter(current, brandId),
      from,
      to,
    );
  }

  @Get('top-flagged-products')
  @Roles('super_admin', 'brand_manager')
  getTopFlaggedProducts(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analyticsService.getTopFlaggedProducts(
      scopedBrandFilter(current, brandId),
      parseLimit(limit, 10),
    );
  }
}
