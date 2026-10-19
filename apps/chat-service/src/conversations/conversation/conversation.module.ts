import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ConversationService } from './conversations.service';
import { ConversationController } from './conversation.controller';
import { ConversationRoomModule } from '../../realtime/conversation-room.module';

@Module({
  imports: [AuthModule, ConversationRoomModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
