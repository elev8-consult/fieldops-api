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
    const parsedPage  = page  ? parseInt(page,  10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;

    return this.reviewService.getQueue({
      brandId:    brandId    || undefined,
      reportType: reportType || undefined,
      status:     status     || undefined,
      page:       isNaN(parsedPage)  ? 1  : parsedPage,
      limit:      isNaN(parsedLimit) ? 20 : parsedLimit,
    });
  }

  @Get('count')
  getCount(@Query('brand_id') brandId?: string) {
    return this.reviewService.getQueueCount(brandId || undefined);
  }

  @Patch('flags/:flagId/resolve')
  resolveFlag(
    @Param('flagId', new ParseUUIDPipe({ version: '4' })) flagId: string,
    @CurrentUser() user: any,
  ) {
    return this.reviewService.resolveFlag(flagId, user.id);
  }

  @Patch('flags/:flagId/dismiss')
  dismissFlag(
    @Param('flagId', new ParseUUIDPipe({ version: '4' })) flagId: string,
    @CurrentUser() user: any,
  ) {
    return this.reviewService.dismissFlag(flagId, user.id);
  }

  @Get(':id')
  getReport(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reviewService.getReport(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: any,
  ) {
    return this.reviewService.update(id, body);
  }

  @Post(':id/approve')
  approve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: any,
  ) {
    return this.reviewService.approve(id, user.id);
  }

  @Post(':id/reject')
  reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reviewService.reject(id);
  }

  @Post('items/:itemId/accept-match')
  acceptMatch(
    @Param('itemId', new ParseUUIDPipe({ version: '4' })) itemId: string,
    @Body()
    body: {
      productId: string;
      rawName: string;
      reportType: 'merchandiser' | 'promoter_sale' | 'promoter_sample';
    },
    @CurrentUser() user: any,
  ) {
    return this.reviewService.acceptProductMatch(
      itemId,
      body.productId,
      body.rawName,
      String(user.id),
      body.reportType,
    );
  }
}
