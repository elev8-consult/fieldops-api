import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.promoterService.findOne(id as unknown as number, current);
  }

  @Patch(':id')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateReport(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePromoterReportDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.promoterService.updateReport(
      id as unknown as number,
      dto,
      current,
    );
  }

  @Patch(':id/sales/:itemId')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateSale(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('itemId', new ParseUUIDPipe({ version: '4' })) itemId: string,
    @Body() dto: UpdatePromoterSaleItemDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.promoterService.updateSaleItem(
      id as unknown as number,
      itemId as unknown as number,
      dto,
      current,
    );
  }

  @Patch(':id/samples/:itemId')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateSample(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('itemId', new ParseUUIDPipe({ version: '4' })) itemId: string,
    @Body() dto: UpdatePromoterSampleItemDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.promoterService.updateSampleItem(
      id as unknown as number,
      itemId as unknown as number,
      dto,
      current,
    );
  }
}
