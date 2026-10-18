import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { ListShelfPhotosDto } from './dto/list-shelf-photos.dto';
import { ShelfPhotosService } from './shelf-photos.service';

@Controller('shelf-photos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'brand_manager', 'supervisor')
export class ShelfPhotosController {
  constructor(private readonly shelfPhotos: ShelfPhotosService) {}

  @Get()
  list(@CurrentUser() current: JwtUser, @Query() query: ListShelfPhotosDto) {
    return this.shelfPhotos.list(current, query);
  }
}
