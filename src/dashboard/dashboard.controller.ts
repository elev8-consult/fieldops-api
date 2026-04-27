import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { MerchandiserDashboardQueryDto } from './dto/merchandiser-dashboard-query.dto';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('merchandiser')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  getMerchandiserDashboard(
    @CurrentUser() current: JwtUser,
    @Query() query: MerchandiserDashboardQueryDto,
  ): Promise<unknown> {
    return this.dashboardService.getMerchandiserDashboard(current, query);
  }

  @Get('merchandiser/export')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  async exportMerchandiserExcel(
    @CurrentUser() current: JwtUser,
    @Query() query: MerchandiserDashboardQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.dashboardService.exportToExcel(current, query);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="merchandiser-report.xlsx"',
    });
    res.send(file);
  }
}
