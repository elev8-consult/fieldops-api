import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
      brandId != null && brandId !== '' ? parseInt(brandId, 10) : undefined,
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
      brandId != null && brandId !== '' ? parseInt(brandId, 10) : undefined,
    );
  }

  @Get('reports-by-day')
  @Roles('super_admin', 'brand_manager')
  getReportsByDay(
    @Query('brand_id') brandId?: string,
    @Query('from')     from?:    string,
    @Query('to')       to?:      string,
  ) {
    return this.analyticsService.getReportsByDay(brandId, from, to);
  }

  @Get('top-flagged-products')
  @Roles('super_admin', 'brand_manager')
  getTopFlaggedProducts(
    @Query('brand_id') brandId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.analyticsService.getTopFlaggedProducts(
      brandId || undefined,
      isNaN(parsedLimit) ? 10 : parsedLimit,
    );
  }
}
