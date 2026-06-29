import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { SubmitMobileReportDto } from './dto/submit-mobile-report.dto';
import { MobileService } from './mobile.service';

@Controller('reports/mobile')
@UseGuards(JwtAuthGuard)
export class MobileController {
  constructor(private readonly mobileService: MobileService) {}

  @Post()
  submit(
    @CurrentUser() current: JwtUser,
    @Body() dto: SubmitMobileReportDto,
  ) {
    return this.mobileService.submit(current, dto);
  }
}
