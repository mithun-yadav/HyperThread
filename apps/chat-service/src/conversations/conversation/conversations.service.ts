import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  async addMember(callerId: string, conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
      },
      include: {
        members: {
          where: {
            userId: callerId,
          },
          select: {
            role: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException(
        'Members can only be added in group conversations',
      );
    }

    const callerMembership = conversation.members[0];

    if (!callerMembership || callerMembership.role !== ConversationRole.ADMIN) {
      throw new ForbiddenException('Only group admin can add members');
    }

    const existingMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('User is already a member');
    }

    return this.prisma.conversationMember.create({
      data: {
        conversationId,
        userId,
        role: ConversationRole.MEMBER,
      },
    });
  }

  async removeMember(callerId: string, conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
      },
      include: {
        members: {
          where: {
            userId: callerId,
          },
          select: {
            role: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException(
        'Member can only be remove from group conversation',
      );
    }

    const callerMembership = conversation.members[0];

    if (!callerMembership || callerMembership.role !== ConversationRole.ADMIN) {
      throw new ForbiddenException('Only group admin can remove members');
    }

    if (callerId === userId) {
      throw new BadRequestException(
        'You cannot remove yourself from the group',
      );
    }

    const tagMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!tagMember) {
      throw new NotFoundException('User is not a member of this conversation');
    }

    await this.prisma.conversationMember.delete({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    return {
      message: 'Member removed successfully',
    };
  }

  async leaveGroup(callerId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
      },
      include: {
        members: {
          where: {
            userId: callerId,
          },
          select: {
            role: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('You can only leave group conversation');
    }

    const callerMembership = conversation.members[0];

    if (!callerMembership) {
      throw new NotFoundException('You are not a member of this conversation');
    }

    await this.prisma.$transaction(async (tx) => {
      if (callerMembership.role === ConversationRole.ADMIN) {
        const nextAdmin = await tx.conversationMember.findFirst({
          where: {
            conversationId,
            userId: {
              not: callerId,
            },
          },
          orderBy: {
            joinedAt: 'asc',
          },
        });

        if (!nextAdmin) {
          throw new BadRequestException(
            'You cannot leave the group because you are the only member',
          );
        }

        await tx.conversationMember.update({
          where: {
            id: nextAdmin.id,
          },
          data: {
            role: ConversationRole.ADMIN,
          },
        });
      }
      await tx.conversationMember.delete({
        where: {
          conversationId_userId: {
            conversationId,
            userId: callerId,
          },
        },
      });
    });
    return {
      message: 'You left the group successfully',
    };
  }
}
