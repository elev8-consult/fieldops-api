import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Region } from './entities/region.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Region])],
  exports: [TypeOrmModule],
})
// Audit fix: dedicated Regions module added per schema checklist.
export class RegionsModule {}
