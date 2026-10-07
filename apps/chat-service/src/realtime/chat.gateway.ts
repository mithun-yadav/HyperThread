import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';
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
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ParseUUIDPipe,
  UsePipes,
} from '@nestjs/common';
import { MessageService } from '../message/message.service';
import { SendSocketMessageDto } from '../conversations/dto/send-message.dto';
import { WsValidationPipe } from '../common/pipes/ws-validation.pipe';
import { subscribe } from 'diagnostics_channel';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5000'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly messageService: MessageService,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;

    if (!token || typeof token !== 'string') {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      client.data.userId = payload.sub;

      await this.redisService.setSocketPresence(client.data.userId, client.id);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    if (!client.data.userId) {
      return;
    }

    await this.redisService.removeSocketPresence(client.data.userId, client.id);
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ParseUUIDPipe()) conversationId: string,
  ) {
    // console.log('🔎 SOCKET JOIN');
    // console.log('conversationId:', conversationId);
    // console.log('socket userId:', client.data.userId);

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

  @UsePipes(new WsValidationPipe())
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendSocketMessageDto,
  ) {
    let result;
    try {
      result = await this.messageService.sendMessage(
        dto.conversationId,
        client.data.userId,
        dto,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new WsException({
          errorCode: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        });
      }
      if (error instanceof ConflictException) {
        throw new WsException({
          errorCode: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency key was already used for different request',
        });
      }
      throw new WsException({
        errorCode: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      });
    }

    if (result.created) {
      this.server.to(dto.conversationId).emit('newMessage', result.message);
    }

    return result.message;
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    try {
      console.log('HEARTBEAT RECEIVED:', client.id);
      if (!client.data.userId) {
        throw new WsException({
          errorCode: 'UNAUTHORIZED',
          message: 'Unauthorized',
        });
      }

      await this.redisService.refreshSocketPresence(
        client.data.userId,
        client.id,
      );

      return {
        event: 'heartbeat',
        data: {
          status: 'ok',
        },
      };
    } catch {
      throw new WsException({
        errorCode: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      });
    }
  }
}
