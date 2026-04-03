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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('super_admin', 'brand_manager')
  findAll(
    @CurrentUser() current: JwtUser,
    @Query('brand_id') brandId?: string,
  ) {
    const bid =
      brandId != null && brandId !== '' ? parseInt(brandId, 10) : undefined;
    return this.usersService.findAll(current, bid);
  }

  @Get(':id')
  @Roles('super_admin', 'brand_manager')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.usersService.findOne(id as unknown as number, current);
  }

  @Post()
  @Roles('super_admin')
  create(@Body() dto: CreateUserDto, @CurrentUser() current: JwtUser) {
    return this.usersService.create(dto, current);
  }

  @Patch(':id')
  @Roles('super_admin', 'brand_manager')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() current: JwtUser,
  ) {
    return this.usersService.update(id as unknown as number, dto, current);
  }

  @Delete(':id')
  @Roles('super_admin')
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() current: JwtUser,
  ) {
    return this.usersService.softDelete(id as unknown as number, current);
  }
}
