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
  OnGatewayInit,
} from '@nestjs/websockets';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ParseUUIDPipe,
  UsePipes,
} from '@nestjs/common';
import { MessageService } from '../message/message.service';
import { SendSocketMessageDto } from '../conversations/dto/send-message.dto';
import { WsValidationPipe } from '../common/pipes/ws-validation.pipe';
import { MessageEventsService } from '../message/message-events.service';
import { ConversationRoomService } from './conversation-room.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(ChatGateway.name);
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly messageService: MessageService,
    private readonly redisService: RedisService,
    private readonly messageEventsService: MessageEventsService,
    private readonly conversationRoomService: ConversationRoomService,
  ) {
    this.messageEventsService.registerMessageEditedHandler(
      (conversationId, message) => {
        void this.emitMessageEdited(conversationId, message).catch(
          (error: unknown) => {
            this.logger.error(
              `Failed to broadcast messageEdited for conversation ${conversationId}`,
              error instanceof Error ? error.stack : String(error),
            );
          },
        );
      },
    );

    this.messageEventsService.registerMessageDeleteHandler(
      (conversationId, message) => {
        void this.emitMessageDeleted(conversationId, message).catch(
          (error: unknown) => {
            this.logger.error(
              `Failed to broadcast messageDeleted for conversation ${conversationId}`,
              error instanceof Error ? error.stack : String(error),
            );
          },
        );
      },
    );
  }

  // emitMessageEdited(conversationId: string, message: unknown) {
  //   this.server.to(conversationId).emit('messageEdited', message);
  // }

  async emitMessageEdited(
    conversationId: string,
    message: unknown,
  ): Promise<void> {
    await this.conversationRoomService.emitToConversationMembers(
      conversationId,
      'messageEdited',
      message,
    );
  }

  // emitMessageDeleted(conversationId: string, message: unknown) {
  //   this.server.to(conversationId).emit('messageDeleted', message);
  // }

  async emitMessageDeleted(
    conversationId: string,
    message: unknown,
  ): Promise<void> {
    await this.conversationRoomService.emitToConversationMembers(
      conversationId,
      'messageDeleted',
      message,
    );
  }

  afterInit(server: Server): void {
    this.conversationRoomService.registerServer(server);
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;

    if (!token || typeof token !== 'string') {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
      });

      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.sub !== 'string' ||
        payload.sub.trim().length === 0
      ) {
        client.disconnect();
        return;
      }

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
    if (!client.data.userId) {
      throw new WsException({
        errorCode: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

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
    if (!client.data.userId) {
      throw new WsException({
        errorCode: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }
    let result;
    try {
      const allowed = await this.redisService.consumeRateLimit(
        `rate-limit:ws:send-message:${client.data.userId}`,
        10,
        60,
      );
      if (!allowed) {
        throw new WsException({
          errorCode: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many messages. Try again later.',
        });
      }
      result = await this.messageService.sendMessage(
        dto.conversationId,
        client.data.userId,
        dto,
      );
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }
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
      try {
        await this.conversationRoomService.emitToConversationMembers(
          dto.conversationId,
          'newMessage',
          result.message,
        );
      } catch (error) {
        this.logger.error(
          `Failed to broadcast newMessage for conversation ${dto.conversationId} `,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return result.message;
  }

  @SubscribeMessage('acknowledgeDelivery')
  async handleAcknowledgeDelivery(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ParseUUIDPipe()) messageId: string,
  ) {
    if (!client.data.userId) {
      throw new WsException({
        errorCode: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

    let message;

    try {
      message = await this.messageService.acknowledgeDelivery(
        messageId,
        client.data.userId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new WsException({
          errorCode: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
      }

      if (error instanceof ConflictException) {
        throw new WsException({
          errorCode: 'SENDER_CANNOT_ACKNOWLEDGE',
          message: 'Sender cannot acknowledge their own message',
        });
      }

      throw new WsException({
        errorCode: 'DELIVERY_ACKNOWLEDGEMENT_FAILED',
        message: 'could not acknowledge message delivery',
      });
    }

    try {
      await this.conversationRoomService.emitToConversationMembers(
        message.conversationId,
        'messageDelivered',
        {
          messageId: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          status: message.status,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast messageDelivered for conversation ${message.conversationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      event: 'deliveryAcknowledged',
      data: {
        messageId: message.id,
        status: message.status,
      },
    };
  }

  @SubscribeMessage('acknowledgeRead')
  async handleAcknowledgeRead(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ParseUUIDPipe()) messageId: string,
  ) {
    if (!client.data.userId) {
      throw new WsException({
        errorCode: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

    let message;

    try {
      message = await this.messageService.acknowledgeRead(
        messageId,
        client.data.userId,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        (error.getResponse() as { errorCode?: string }).errorCode ===
          'DIRECT_CHAT_ONLY'
      ) {
        throw new WsException({
          errorCode: 'DIRECT_CHAT_ONLY',
          message: 'Read acknowledgement is only supported for direct chats',
        });
      }

      if (error instanceof NotFoundException) {
        throw new WsException({
          errorCode: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
      }

      if (error instanceof ConflictException) {
        throw new WsException({
          errorCode: 'SENDER_CANNOT_ACKNOWLEDGE',
          message: 'Sender cannot acknowledge their own message',
        });
      }

      throw new WsException({
        errorCode: 'READ_ACKNOWLEDGEMENT_FAILED',
        message: 'Could not acknowledge message read status',
      });
    }

    try {
      await this.conversationRoomService.emitToConversationMembers(
        message.conversationId,
        'messageRead',
        {
          messageId: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          status: message.status,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast messageRead for conversation ${message.conversationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      event: 'readAcknowledged',
      data: {
        messageId: message.id,
        status: message.status,
      },
    };
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    try {
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
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }

      throw new WsException({
        errorCode: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ParseUUIDPipe()) conversationId: string,
  ) {
    if (!client.data.userId) {
      throw new WsException({
        errorCode: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

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

    client.to(conversationId).emit('userTyping', {
      conversationId,
      userId: client.data.userId,
    });

    return {
      event: 'typingAcknowledged',
      data: { conversationId },
    };
  }

  @SubscribeMessage('stopTyping')
  async handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ParseUUIDPipe()) conversationId: string,
  ) {
    if (!client.data.userId) {
      throw new WsException({
        errorCode: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

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

    client.to(conversationId).emit('userStoppedTyping', {
      conversationId,
      userId: client.data.userId,
    });

    return {
      event: 'stopTypingAcknowledged',
      data: { conversationId },
    };
  }
}
