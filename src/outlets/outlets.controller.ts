import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { OutletsService } from './outlets.service';

@Controller('outlets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OutletsController {
  constructor(private readonly outletsService: OutletsService) {}

  @Get()
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findAll(
    @CurrentUser() current: JwtUser,
    @Query('region_id') regionId?: string,
    @Query('is_depot') isDepot?: string,
    @Query('search') search?: string,
  ) {
    return this.outletsService.findAll(current, {
      regionId:
        regionId != null && regionId !== ''
          ? parseInt(regionId, 10)
          : undefined,
      isDepot:
        isDepot === 'true' ? true : isDepot === 'false' ? false : undefined,
      search,
    });
  }

  @Get(':id')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.outletsService.findOne(id as unknown as number, current);
  }

  @Post()
  @Roles('super_admin', 'brand_manager')
  create(@Body() dto: CreateOutletDto) {
    return this.outletsService.create(dto);
  }

  @Patch(':id')
  @Roles('super_admin', 'brand_manager')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateOutletDto,
  ) {
    return this.outletsService.update(id as unknown as number, dto);
  }

  @Delete(':id')
  @Roles('super_admin')
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.outletsService.softDelete(id as unknown as number);
  }
}
