import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import {
  ReplaceMobileReportDto,
  SubmitMobileReportDto,
} from './dto/submit-mobile-report.dto';
import { MobileService } from './mobile.service';

@Controller('reports/mobile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('merchandiser', 'promoter')
export class MobileController {
  constructor(private readonly mobileService: MobileService) {}

  /** Home-screen summary for the logged-in field user. */
  @Get('summary')
  summary(@CurrentUser() current: JwtUser) {
    return this.mobileService.summary(current);
  }

  @Post()
  submit(@CurrentUser() current: JwtUser, @Body() dto: SubmitMobileReportDto) {
    return this.mobileService.submit(current, dto);
  }

  /** Items already submitted for this store today, so the visit can be edited. */
  @Get('outlets/:outletId')
  today(
    @CurrentUser() current: JwtUser,
    @Param('outletId', ParseUUIDPipe) outletId: string,
  ) {
    return this.mobileService.today(current, outletId);
  }

  /**
   * Create or replace today's visit at this store. Sending the full list
   * (with quantities already added together) is what makes "add more of item
   * A" safe to retry.
   */
  @Put('outlets/:outletId')
  replace(
    @CurrentUser() current: JwtUser,
    @Param('outletId', ParseUUIDPipe) outletId: string,
    @Body() dto: ReplaceMobileReportDto,
  ) {
    return this.mobileService.replace(current, outletId, dto);
  }
}
