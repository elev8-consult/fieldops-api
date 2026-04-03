import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@Controller('brands')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findAll(@CurrentUser() current: JwtUser) {
    return this.brandsService.findAll(current);
  }

  @Get(':id')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.brandsService.findOne(id, current);
  }

  @Post()
  @Roles('super_admin')
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Patch(':id')
  @Roles('super_admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('super_admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.softDelete(id);
  }
}
