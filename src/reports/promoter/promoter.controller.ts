import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { UpdatePromoterReportDto } from './dto/update-promoter-report.dto';
import { UpdatePromoterSaleItemDto } from './dto/update-promoter-sale-item.dto';
import { UpdatePromoterSampleItemDto } from './dto/update-promoter-sample-item.dto';
import { PromoterService } from './promoter.service';

@Controller('reports/promoter')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromoterController {
  constructor(private readonly promoterService: PromoterService) {}

  @Get()
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  list(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
    @Query('outlet_id') outletId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.promoterService.list(current, {
      brandId:
        brandId != null && brandId !== ''
          ? parseInt(brandId, 10)
          : undefined,
      outletId:
        outletId != null && outletId !== ''
          ? parseInt(outletId, 10)
          : undefined,
      from,
      to,
      status,
      page: page != null && page !== '' ? parseInt(page, 10) : undefined,
      limit: limit != null && limit !== '' ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.promoterService.findOne(id, current);
  }

  @Patch(':id')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateReport(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromoterReportDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.promoterService.updateReport(id, dto, current);
  }

  @Patch(':id/sales/:itemId')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateSale(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdatePromoterSaleItemDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.promoterService.updateSaleItem(id, itemId, dto, current);
  }

  @Patch(':id/samples/:itemId')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateSample(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdatePromoterSampleItemDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.promoterService.updateSampleItem(id, itemId, dto, current);
  }
}
