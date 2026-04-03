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
import { UpdateMerchandiserItemDto } from './dto/update-merchandiser-item.dto';
import { UpdateMerchandiserReportDto } from './dto/update-merchandiser-report.dto';
import { MerchandiserService } from './merchandiser.service';

@Controller('reports/merchandiser')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchandiserController {
  constructor(private readonly merchandiserService: MerchandiserService) {}

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
    return this.merchandiserService.list(current, {
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
    return this.merchandiserService.findOne(id, current);
  }

  @Patch(':id')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateReport(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMerchandiserReportDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.merchandiserService.updateReport(id, dto, current);
  }

  @Patch(':id/items/:itemId')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateMerchandiserItemDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.merchandiserService.updateItem(id, itemId, dto, current);
  }
}
