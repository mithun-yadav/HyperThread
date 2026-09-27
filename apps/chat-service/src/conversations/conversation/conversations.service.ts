import { BadRequestException, Injectable } from '@nestjs/common';
import { ConversationType } from '../../generated/prisma/client';
import type { CreateDirectConversationDto } from '../dto/create-direct-conversation.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupConversationDto } from '../dto/create-group-conversation.dto';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}
  async createDirect(callerId: string, dto: CreateDirectConversationDto) {
    const recipientId = dto.recipientId;

    if (callerId === recipientId) {
      throw new BadRequestException(
        'You cannot create a conversation with yourself',
      );
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        members: {
          some: { userId: callerId },
        },
        AND: {
          members: {
            some: { userId: recipientId },
          },
        },
      },
      include: {
        members: true,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        members: {
          create: [{ userId: callerId }, { userId: recipientId }],
        },
      },
      include: {
        members: true,
      },
    });
  }

  async createGroup(callerId: string, dto:CreateGroupConversationDto ) {
    const uniqueMemberIds = [...new Set(dto.memberIds)].filter((id)=> id !== callerId);
    if(uniqueMemberIds.length < 2) {
        throw new BadRequestException('Select a member to create a group')
    }

    return this.prisma.conversation.create({
        data:{
            type: ConversationType.GROUP,
            name:dto.name,
            members: {
                create: [
                    {userId: callerId},
                ...uniqueMemberIds.map((userId)=> ({userId})),
                ]
            }
        },
        include:{
            members: true,
        }
    })
  }
}
