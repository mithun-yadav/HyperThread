import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ConversationType,
  Prisma,
  ConversationRole,
} from '../../generated/prisma/client';
import type { CreateDirectConversationDto } from '../dto/create-direct-conversation.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupConversationDto } from '../dto/create-group-conversation.dto';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}
  async createDirect(callerId: string, dto: CreateDirectConversationDto) {
    const recipientId = dto.recipientId;
    const directKey = [callerId, recipientId].sort().join(':');

    if (callerId === recipientId) {
      throw new BadRequestException(
        'You cannot create a conversation with yourself',
      );
    }

    const existing = await this.prisma.conversation.findUnique({
      where: {
        directKey,
      },
      include: {
        members: true,
      },
    });

    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          directKey,
          members: {
            create: [{ userId: callerId }, { userId: recipientId }],
          },
        },
        include: {
          members: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingConversation = await this.prisma.conversation.findUnique({
          where: {
            directKey,
          },
          include: {
            members: true,
          },
        });
        if (existingConversation) {
          return existingConversation;
        }
      }
      throw error;
    }
  }

  async createGroup(callerId: string, dto: CreateGroupConversationDto) {
    const uniqueMemberIds = [...new Set(dto.memberIds)].filter(
      (id) => id !== callerId,
    );
    if (uniqueMemberIds.length < 2) {
      throw new BadRequestException('Select a member to create a group');
    }

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name: dto.name,
        members: {
          create: [
            {
              userId: callerId,
              role: ConversationRole.ADMIN,
            },
            ...uniqueMemberIds.map((userId) => ({ userId })),
          ],
        },
      },
      include: {
        members: true,
      },
    });
  }

  async getUserConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async getConversation(conversationId: string, userId: string) {
    return this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: true,
      },
    });
  }
}
