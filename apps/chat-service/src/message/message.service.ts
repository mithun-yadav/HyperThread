import type { OutboxEvent } from '../generated/prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from '../conversations/dto/send-message.dto';
import {
  ConversationType,
  MessageStatus,
  Prisma,
} from '../generated/prisma/client';
import { EditMessageDto } from '../conversations/dto/edit-message.dto';
import { randomUUID } from 'node:crypto';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureMembership(conversationId: string, callerId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: callerId,
        },
      },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Conversation not found',
        errorCode: 'CONVERSATION_NOT_FOUND',
      });
    }
    return membership;
  }

  async checkMembership(conversationId: string, callerId: string) {
    await this.ensureMembership(conversationId, callerId);
  }

  async sendMessage(
    conversationId: string,
    callerId: string,
    dto: SendMessageDto,
  ) {
    await this.ensureMembership(conversationId, callerId);

    try {
      const message = await this.prisma.$transaction(async (tx) => {
        const createMessage = await tx.message.create({
          data: {
            conversationId,
            senderId: callerId,
            content: dto.content,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        const eventId = randomUUID();

        await tx.outboxEvent.create({
          data: {
            id: eventId,
            eventType: 'MessageCreated',
            aggregateId: createMessage.id,
            payload: {
              eventId,
              eventType: 'MessageCreated',
              aggregateId: createMessage.id,
              occurredAt: createMessage.createdAt.toISOString(),
              data: {
                id: createMessage.id,
                conversationId: createMessage.conversationId,
                senderId: createMessage.senderId,
                content: createMessage.content,
                createdAt: createMessage.createdAt.toISOString(),
                status: createMessage.status,
              },
            },
          },
        });
        return createMessage;
      });

      return {
        message,
        created: true,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.message.findUnique({
          where: {
            senderId_idempotencyKey: {
              senderId: callerId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (existing) {
          const isSameRequest =
            existing.senderId === callerId &&
            existing.conversationId === conversationId &&
            existing.content === dto.content;

          if (isSameRequest) {
            return {
              message: existing,
              created: false,
            };
          }
        }
        throw new ConflictException({
          message: 'Idempotency key was already used for different request',
          errorCode: 'IDEMPOTENCY_KEY_REUSED',
        });
      }
      throw error;
    }
  }

  async getMessages(
    conversationId: string,
    callerId: string,
    limit: number = 50,
    before?: string,
  ) {
    await this.ensureMembership(conversationId, callerId);
    let cursorMessage;
    if (before) {
      cursorMessage = await this.prisma.message.findFirst({
        where: {
          id: before,
          conversationId,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });
      if (!cursorMessage) {
        throw new NotFoundException({
          message: 'Message not found',
          errorCode: 'MESSAGE_NOT_FOUND',
        });
      }
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(cursorMessage && {
          OR: [
            {
              createdAt: {
                lt: cursorMessage.createdAt,
              },
            },
            {
              createdAt: cursorMessage.createdAt,
              id: {
                lt: cursorMessage.id,
              },
            },
          ],
        }),
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: limit + 1,
    });

    const hasMore = messages.length > limit;

    if (hasMore) {
      messages.pop();
    }

    messages.reverse();
    return {
      messages,
      hasMore,
      nextBefore: hasMore ? messages[0]?.id : null,
    };
  }

  async acknowledgeDelivery(messageId: string, callerId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          select: {
            type: true,
            members: {
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!message) {
      throw new NotFoundException({
        message: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      });
    }
    if (message.conversation.type !== ConversationType.DIRECT) {
      throw new BadRequestException({
        message: 'Delivery acknowledgement is only supported for direct chats',
        errorCode: 'DIRECT_CHAT_ONLY',
      });
    }

    const isMember = message.conversation.members.some(
      (member) => member.userId === callerId,
    );

    if (!isMember) {
      throw new NotFoundException({
        message: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      });
    }

    if (message.senderId === callerId) {
      throw new ConflictException({
        message: 'Senders cannot acknowledge their own message',
        errorCode: 'SENDER_CANNOT_ACKNOWLEDGE',
      });
    }

    await this.prisma.message.updateMany({
      where: {
        id: messageId,
        status: MessageStatus.SENT,
      },
      data: {
        status: MessageStatus.DELIVERED,
      },
    });

    const updateMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!updateMessage) {
      throw new NotFoundException({
        message: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      });
    }

    return updateMessage;
  }

  async acknowledgeRead(messageId: string, callerId: string) {
    const message = await this.prisma.message.findUnique({
      where: {
        id: messageId,
      },
      include: {
        conversation: {
          select: {
            type: true,
            members: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        message: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      });
    }

    if (message.conversation.type !== ConversationType.DIRECT) {
      throw new BadRequestException({
        message: 'Read acknowledgement is only supported for direct chats',
        errorCode: 'DIRECT_CHAT_ONLY',
      });
    }

    const isMember = message.conversation.members.some(
      (member) => member.userId == callerId,
    );

    if (!isMember) {
      throw new NotFoundException({
        message: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      });
    }

    if (message.senderId === callerId) {
      throw new ConflictException({
        message: 'Senders cannot acknowledge their own message',
        errorCode: 'SENDER_CANNOT_ACKNOWLEDGE',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.message.updateMany({
        where: {
          id: messageId,
          status: {
            in: [MessageStatus.SENT, MessageStatus.DELIVERED],
          },
        },
        data: {
          status: MessageStatus.READ,
        },
      });
      const updatedMessage = await tx.message.findUnique({
        where: { id: messageId },
      });

      if (!updatedMessage) {
        throw new NotFoundException({
          message: 'Message not found',
          errorCode: 'MESSAGE_NOT_FOUND',
        });
      }

      if (updateResult.count > 0) {
        const eventId = randomUUID();

        await tx.outboxEvent.create({
          data: {
            id: eventId,
            eventType: 'MessageRead',
            aggregateId: updatedMessage.id,
            payload: {
              eventId,
              eventType: 'MessageRead',
              aggregateId: updatedMessage.id,
              occurredAt: new Date().toISOString(),
              data: {
                id: updatedMessage.id,
                conversationId: updatedMessage.conversationId,
                senderId: updatedMessage.senderId,
                readerId: callerId,
                status: updatedMessage.status,
              },
            },
          },
        });
      }

      return updatedMessage;
    });

    return result;
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    callerId: string,
    dto: EditMessageDto,
  ) {
    await this.ensureMembership(conversationId, callerId);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
      },
    });
    if (!message) {
      throw new NotFoundException({
        message: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      });
    }
    if (message.senderId !== callerId) {
      throw new ConflictException({
        message: 'Only the sender can edit this message',
        errorCode: 'MESSAGE_EDIT_FORBIDDEN',
      });
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: dto.content,
        editedAt: new Date(),
      },
    });
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    callerId: string,
  ) {
    await this.ensureMembership(conversationId, callerId);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
      },
    });

    if (!message || message.deletedAt) {
      throw new NotFoundException({
        message: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      });
    }

    if (message.senderId !== callerId) {
      throw new ConflictException({
        message: 'Only the sender can delete this message',
        errorCode: 'MESSAGE_DELETE_FORBIDDEN',
      });
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        deletedAt: new Date(),
      },
    });
  }
}
