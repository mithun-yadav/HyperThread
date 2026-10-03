import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, ParseUUIDPipe } from '@nestjs/common';
import { MessageService } from '../message/message.service';
import { SendSocketMessageDto } from '../conversations/dto/send-message.dto';

@Injectable()
@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
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
  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ParseUUIDPipe()) conversationId: string,
  ) {
    console.log('🔎 SOCKET JOIN');
    console.log('conversationId:', conversationId);
    console.log('socket userId:', client.data.userId);

    try {
      await this.messageService.checkMembership(
        conversationId,
        client.data.userId,
      );
    } catch {
      throw new WsException({
        errorCode: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
      });
    }

    await client.join(conversationId);

    return {
      event: 'joinedConversation',
      data: { conversationId },
    };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendSocketMessageDto,
  ) {
    const result = await this.messageService.sendMessage(
      dto.conversationId,
      client.data.userId,
      dto,
    );

    if (result.created)
      this.server.to(dto.conversationId).emit('newMessage', result.message);

    return result.message;
  }
}
