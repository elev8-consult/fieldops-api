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
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ResolveUnknownSenderDto } from './dto/resolve-unknown-sender.dto';
import { UnknownSendersService } from './unknown-senders.service';

@Controller('unknown-senders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'brand_manager')
export class UnknownSendersController {
  constructor(private readonly unknownSendersService: UnknownSendersService) {}

  @Get()
  list(@Query('resolved') resolved?: string) {
    return this.unknownSendersService.list(resolved);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.unknownSendersService.findOne(id);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ResolveUnknownSenderDto,
  ) {
    return this.unknownSendersService.resolve(id, dto.brand_id);
  }
}
