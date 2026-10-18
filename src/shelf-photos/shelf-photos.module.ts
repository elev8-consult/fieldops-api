import { Module } from '@nestjs/common';
import { ShelfPhotoStorage } from './shelf-photo-storage.service';
import { ShelfPhotosController } from './shelf-photos.controller';
import { ShelfPhotosService } from './shelf-photos.service';

@Module({
  controllers: [ShelfPhotosController],
  providers: [ShelfPhotosService, ShelfPhotoStorage],
})
export class ShelfPhotosModule {}
