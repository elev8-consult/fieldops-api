import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnknownSender } from './entities/unknown-sender.entity';
import { UnknownSendersController } from './unknown-senders.controller';
import { UnknownSendersService } from './unknown-senders.service';

@Module({
  imports: [TypeOrmModule.forFeature([UnknownSender])],
  controllers: [UnknownSendersController],
  providers: [UnknownSendersService],
  exports: [UnknownSendersService],
})
export class UnknownSendersModule {}
