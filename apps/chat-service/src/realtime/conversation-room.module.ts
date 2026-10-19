import { Module } from '@nestjs/common';
import { ConversationRoomService } from './conversation-room.service';

@Module({
  providers: [ConversationRoomService],
  exports: [ConversationRoomService],
})
export class ConversationRoomModule {}
