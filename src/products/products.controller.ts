import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { CreateAliasDto } from './dto/create-alias.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findAll(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
    @Query('flow') flow?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(current, {
      brandId:
        brandId != null && brandId !== ''
          ? parseInt(brandId, 10)
          : undefined,
      flow,
      search,
    });
  }

  @Delete('aliases/:aliasId')
  @Roles('super_admin', 'brand_manager')
  removeAlias(
    @Param('aliasId', ParseIntPipe) aliasId: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.removeAlias(aliasId, current);
  }

  @Get(':id/aliases')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  listAliases(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.listAliases(id, current);
  }

  @Post(':id/aliases')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  addAlias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAliasDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.addAlias(id, dto, current);
  }

  @Get(':id')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.findOne(id, current);
  }

  @Post()
  @Roles('super_admin', 'brand_manager')
  create(@Body() dto: CreateProductDto, @CurrentUser() current: JwtUser) {
    return this.productsService.create(dto, current);
  }

  @Patch(':id')
  @Roles('super_admin', 'brand_manager')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.update(id, dto, current);
  }

  @Delete(':id')
  @Roles('super_admin')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() current: JwtUser) {
    return this.productsService.softDelete(id, current);
  }
}
