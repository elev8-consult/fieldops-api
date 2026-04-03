import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { UpdateParsedReportDto } from './dto/update-parsed-report.dto';
import { ReviewService } from './review.service';

@Controller('review')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('queue')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  queue(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
    @Query('report_type') reportType?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewService.queue(current, {
      brandId:
        brandId != null && brandId !== ''
          ? parseInt(brandId, 10)
          : undefined,
      reportType,
      status,
      page: page != null && page !== '' ? parseInt(page, 10) : undefined,
      limit: limit != null && limit !== '' ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch('flags/:flagId/resolve')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  resolveFlag(
    @Param('flagId', ParseIntPipe) flagId: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.resolveFlag(flagId, current);
  }

  @Patch('flags/:flagId/dismiss')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  dismissFlag(
    @Param('flagId', ParseIntPipe) flagId: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.dismissFlag(flagId, current);
  }

  @Get(':id')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.findOne(id, current);
  }

  @Patch(':id')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  updateParsed(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateParsedReportDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.updateParsed(id, dto, current);
  }

  @Post(':id/approve')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.approve(id, current);
  }

  @Post(':id/reject')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.reject(id, current);
  }
}
