import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from '../conversations/dto/send-message.dto';
import { Prisma } from '../generated/prisma/client';

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
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          senderId: callerId,
          content: dto.content,
          idempotencyKey: dto.idempotencyKey,
        },
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
}
