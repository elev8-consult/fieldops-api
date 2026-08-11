import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateAliasDto } from './dto/create-alias.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportCatalogDto } from './dto/import-catalog.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

/** Minimal shape of a Multer file (avoids requiring @types/multer). */
interface UploadedExcelFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query('brand_id') brandId?: string,
    @Query('flow')     flow?:    string,
    @Query('search')   search?:  string,
    @Query('page')     page?:    string,
    @Query('limit')    limit?:   string,
  ) {
    const parsedPage  = page  ? parseInt(page,  10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 100;

    return this.productsService.findAll({
      brandId: brandId && brandId !== 'NaN' && brandId !== 'undefined'
        ? brandId
        : undefined,
      flow:    flow   || undefined,
      search:  search || undefined,
      page:    isNaN(parsedPage)  ? 1   : parsedPage,
      limit:   isNaN(parsedLimit) ? 100 : parsedLimit,
    });
  }

  /** Full barcode catalog for offline caching in the mobile app. */
  @Get('catalog')
  @UseGuards(JwtAuthGuard)
  catalogForSync() {
    return this.productsService.catalogForSync();
  }

  @Get('by-barcode/:barcode')
  @UseGuards(JwtAuthGuard)
  findByBarcode(@Param('barcode') barcode: string) {
    return this.productsService.findByBarcode(barcode);
  }

  @Post('import')
  @Roles('super_admin', 'brand_manager')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  importCatalog(
    @UploadedFile() file: UploadedExcelFile | undefined,
    @Body() dto: ImportCatalogDto,
    @CurrentUser() current: JwtUser,
  ) {
    if (!file) {
      throw new BadRequestException('An Excel file is required (field "file")');
    }
    const dryRun = dto.dryRun === 'true';
    return this.productsService.importCatalog(
      dto.brandId,
      file.buffer,
      current,
      dryRun,
    );
  }

  @Delete('aliases/:aliasId')
  @Roles('super_admin', 'brand_manager')
  removeAlias(
    @Param('aliasId', new ParseUUIDPipe({ version: '4' })) aliasId: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.removeAlias(aliasId, current);
  }

  @Get(':id/aliases')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  listAliases(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.listAliases(id, current);
  }

  @Post(':id/aliases')
  @Roles('super_admin', 'brand_manager', 'reviewer')
  addAlias(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateAliasDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.addAlias(id, dto, current);
  }

  @Get(':id')
  @Roles('super_admin', 'brand_manager', 'supervisor', 'reviewer')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.update(id, dto, current);
  }

  @Delete(':id')
  @Roles('super_admin')
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.productsService.softDelete(id, current);
  }
}
