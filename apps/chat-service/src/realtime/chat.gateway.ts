import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { MessageService } from '../message/message.service';

@Injectable()
@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly messageService: MessageService,
  ) {}

  handleConnection(client: Socket) {
    console.log('🔌 handleConnection:', client.id);

    const token = client.handshake.auth?.token ?? client.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      client.data.userId = payload.sub;

      console.log('✅ Socket authenticated:', client.data.userId);
    } catch {
      console.log('❌ Socket authentication failed');
      client.disconnect();
      return;
    }
  }

  handleDisconnect(client: Socket) {
    console.log('🔌 handleDisconnect:', client.id);
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    console.log('1️⃣ joinConversation received');
    console.log('User:', client.data.userId);
    console.log('Conversation:', conversationId);

    await this.messageService.checkMemberShip(
      conversationId,
      client.data.userId,
    );

    console.log('2️⃣ membership verified');

    await client.join(conversationId);

    console.log('3️⃣ joined room');

    client.emit('joinedConversation', {
      conversationId,
    });

    console.log('4️⃣ confirmation emitted');

    return {
      event: 'joinedConversation',
      conversationId,
    };
  }
}
