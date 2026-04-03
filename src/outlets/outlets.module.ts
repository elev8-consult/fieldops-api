import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Outlet } from './entities/outlet.entity';
import { Region } from './entities/region.entity';
import { OutletsController } from './outlets.controller';
import { OutletsService } from './outlets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Outlet, Region])],
  controllers: [OutletsController],
  providers: [OutletsService],
  exports: [OutletsService],
})
export class OutletsModule {}
