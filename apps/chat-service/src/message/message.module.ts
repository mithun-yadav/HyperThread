import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { MessageEventsService } from './message-events.service';

@Module({
  imports: [AuthModule],
  controllers: [MessageController],
  providers: [MessageService, MessageEventsService],
  exports: [MessageService, MessageEventsService],
})
export class MessageModule {}
