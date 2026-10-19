import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';
import { MessageModule } from '../message/message.module';
import { ConversationRoomModule } from './conversation-room.module';

@Module({
  imports: [AuthModule, MessageModule, ConversationRoomModule],
  providers: [ChatGateway],
})
export class RealtimeModule {}
