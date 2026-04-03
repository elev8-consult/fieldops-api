import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { CurrentUser }   from '../common/decorators/current-user.decorator';

@Controller('review')
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('queue')
  getQueue(
    @Query('brand_id')    brandId?:    string,
    @Query('report_type') reportType?: string,
    @Query('status')      status?:     string,
    @Query('page')        page?:       string,
    @Query('limit')       limit?:      string,
  ) {
    return this.reviewService.getQueue({
      brandId,
      reportType,
      status,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('count')
  getCount(@Query('brand_id') brandId?: string) {
    return this.reviewService.getQueueCount(brandId);
  }

  @Get('flags/:flagId/resolve')
  resolveFlag(
    @Param('flagId') flagId: string,
    @CurrentUser()   user:   any,
  ) {
    return this.reviewService.resolveFlag(flagId, user.id);
  }

  @Patch('flags/:flagId/resolve')
  resolveFlag2(
    @Param('flagId') flagId: string,
    @CurrentUser()   user:   any,
  ) {
    return this.reviewService.resolveFlag(flagId, user.id);
  }

  @Patch('flags/:flagId/dismiss')
  dismissFlag(
    @Param('flagId') flagId: string,
    @CurrentUser()   user:   any,
  ) {
    return this.reviewService.dismissFlag(flagId, user.id);
  }

  @Get(':id')
  getReport(@Param('id') id: string) {
    return this.reviewService.getReport(id);
  }

  @Patch(':id')
  update(
    @Param('id') id:   string,
    @Body()      body: any,
  ) {
    return this.reviewService.update(id, body);
  }

  @Post(':id/approve')
  approve(
    @Param('id')   id:   string,
    @CurrentUser() user: any,
  ) {
    return this.reviewService.approve(id, user.id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.reviewService.reject(id);
  }
}
