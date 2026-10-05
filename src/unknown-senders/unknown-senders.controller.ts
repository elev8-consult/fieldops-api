import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { ResolveUnknownSenderDto } from './dto/resolve-unknown-sender.dto';
import { UnknownSendersService } from './unknown-senders.service';

@Controller('unknown-senders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class UnknownSendersController {
  constructor(private readonly service: UnknownSendersService) {}

  @Get()
  list(@Query('resolved') resolved?: string) {
    const flag =
      resolved === 'true' ? true : resolved === 'false' ? false : undefined;
    return this.service.list(flag);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveUnknownSenderDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.service.resolve(id, dto.brand_id, current);
  }
}
