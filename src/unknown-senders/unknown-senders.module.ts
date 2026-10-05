import { Module } from '@nestjs/common';
import { UnknownSendersController } from './unknown-senders.controller';
import { UnknownSendersService } from './unknown-senders.service';

@Module({
  controllers: [UnknownSendersController],
  providers: [UnknownSendersService],
})
export class UnknownSendersModule {}
