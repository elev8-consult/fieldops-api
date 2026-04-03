import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findAll(
    @CurrentUser() current: JwtUser,
    @Query('status') status?: string,
    @Query('report_type') reportType?: string,
    @Query('brand_id') brandId?: string,
    @Query('sender_phone') senderPhone?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.findAll(current, {
      status,
      reportType,
      brandId:
        brandId != null && brandId !== ''
          ? parseInt(brandId, 10)
          : undefined,
      senderPhone,
      from,
      to,
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
    return this.messagesService.findOne(id, current);
  }
}
