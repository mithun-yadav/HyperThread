import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

@Module({
  imports: [AuthModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
