import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappMessage])],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
