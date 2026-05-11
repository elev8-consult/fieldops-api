import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { MatchOutletDto } from './dto/match-outlet.dto';
import type { MatchOutletResponseDto } from './dto/match-outlet-response.dto';
import { OutletsService } from './outlets.service';

@Controller('outlets')
export class OutletsInternalController {
  constructor(private readonly outletsService: OutletsService) {}

  @Post('match')
  @UseGuards(InternalApiKeyGuard)
  matchOutlet(@Body() body: MatchOutletDto): Promise<MatchOutletResponseDto> {
    return this.outletsService.matchOutlet(body.location_raw, body.brand_id);
  }
}
