import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query('status')       status?:      string,
    @Query('report_type')  reportType?:  string,
    @Query('brand_id')     brandId?:     string,
    @Query('sender_phone') senderPhone?: string,
    @Query('from')         from?:        string,
    @Query('to')           to?:          string,
    @Query('page')         page?:        string,
    @Query('limit')        limit?:       string,
  ) {
    const parsedPage  = page  ? parseInt(page,  10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;

    return this.messagesService.findAll({
      status,
      reportType,
      brandId:     brandId     || undefined,
      senderPhone: senderPhone || undefined,
      from:        from        || undefined,
      to:          to          || undefined,
      page:        isNaN(parsedPage)  ? 1  : parsedPage,
      limit:       isNaN(parsedLimit) ? 20 : parsedLimit,
    });
  }

  @Get(':id')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.messagesService.findOne(id as unknown as number, current);
  }
}
