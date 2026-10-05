import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { parseLimit, parsePage } from '../common/pagination';
import { AcceptMatchDto } from './dto/accept-match.dto';
import { UpdateParsedReportDto } from './dto/update-parsed-report.dto';

@Controller('review')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('queue')
  getQueue(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
    @Query('report_type') reportType?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewService.getQueue(current, {
      brandId: brandId || undefined,
      reportType: reportType || undefined,
      status: status || undefined,
      page: parsePage(page),
      limit: parseLimit(limit, 20),
    });
  }

  @Get('count')
  getCount(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
  ) {
    return this.reviewService.getQueueCount(current, brandId || undefined);
  }

  @Patch('flags/:flagId/resolve')
  resolveFlag(
    @Param('flagId', new ParseUUIDPipe({ version: '4' })) flagId: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.resolveFlag(flagId, current);
  }

  @Patch('flags/:flagId/dismiss')
  dismissFlag(
    @Param('flagId', new ParseUUIDPipe({ version: '4' })) flagId: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.dismissFlag(flagId, current);
  }

  @Get(':id')
  getReport(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.getReport(id, current);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateParsedReportDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.update(id, dto, current);
  }

  @Post(':id/approve')
  approve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.approve(id, current);
  }

  @Post(':id/reject')
  reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.reject(id, current);
  }

  @Post('items/:itemId/accept-match')
  acceptMatch(
    @Param('itemId', new ParseUUIDPipe({ version: '4' })) itemId: string,
    @Body() dto: AcceptMatchDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.reviewService.acceptProductMatch(itemId, dto, current);
  }
}
