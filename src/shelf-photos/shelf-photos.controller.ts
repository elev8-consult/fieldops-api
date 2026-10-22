import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { ListShelfPhotosDto } from './dto/list-shelf-photos.dto';
import { SaveShelfPhotoDto } from './dto/save-shelf-photo.dto';
import { VisitShelfPhotosDto } from './dto/visit-shelf-photos.dto';
import { ShelfPhotosService } from './shelf-photos.service';

interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Controller('shelf-photos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'brand_manager', 'supervisor')
export class ShelfPhotosController {
  constructor(private readonly shelfPhotos: ShelfPhotosService) {}

  @Get()
  list(@CurrentUser() current: JwtUser, @Query() query: ListShelfPhotosDto) {
    return this.shelfPhotos.list(current, query);
  }

  /** Pictures this merchandiser already took at the open store today. */
  @Get('today')
  @Roles('merchandiser', 'promoter')
  today(@CurrentUser() current: JwtUser, @Query() query: VisitShelfPhotosDto) {
    return this.shelfPhotos.visit(current, query.outletId);
  }

  @Post()
  @Roles('merchandiser', 'promoter')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  save(
    @CurrentUser() current: JwtUser,
    @Body() dto: SaveShelfPhotoDto,
    @UploadedFile() file: UploadedPhoto | undefined,
  ) {
    return this.shelfPhotos.save(current, dto, file);
  }

  @Delete('today')
  @Roles('merchandiser', 'promoter')
  remove(@CurrentUser() current: JwtUser, @Query() query: SaveShelfPhotoDto) {
    return this.shelfPhotos.remove(current, query);
  }
}
