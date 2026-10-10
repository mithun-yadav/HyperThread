import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConversationRole,
  ConversationType,
  Prisma,
} from '../generated/prisma/client';
import { ConversationService } from './conversation/conversations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ConversationService', () => {
  let service: ConversationService;

  const prisma = {
    conversation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    conversationMember: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  describe('renameGroup', () => {
    it('allows an admin to rename a group', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.ADMIN }],
      });

      const updatedConversation = {
        id: 'group-1',
        name: 'Engineering Team',
      };

      prisma.conversation.update.mockResolvedValue(updatedConversation);

      await expect(
        service.renameGroup('admin-1', 'group-1', 'Engineering Team'),
      ).resolves.toEqual(updatedConversation);

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'group-1' },
        data: { name: 'Engineering Team' },
      });
    });

    it('rejects a regular member', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.MEMBER }],
      });

      await expect(
        service.renameGroup('member-1', 'group-1', 'New Name'),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('rejects a non-member', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [],
      });

      await expect(
        service.renameGroup('outsider-1', 'group-1', 'New Name'),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('rejects renaming a direct conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.DIRECT,
        members: [{ role: ConversationRole.ADMIN }],
      });

      await expect(
        service.renameGroup('admin-1', 'direct-1', 'New Name'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('rejects a conversation that does not exist', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.renameGroup('admin-1', 'missing-group', 'New Name'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    const conversationId = 'group-1';
    const adminId = 'admin-1';
    const memberId = 'member-1';

    beforeEach(() => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.ADMIN }],
      });

      prisma.conversationMember.findUnique.mockResolvedValue({
        id: 'membership-1',
      });

      prisma.conversationMember.delete.mockResolvedValue({});
    });

    it('allows an admin to remove a member', async () => {
      await expect(
        service.removeMember(adminId, conversationId, memberId),
      ).resolves.toEqual({
        message: 'Member removed successfully',
      });

      expect(prisma.conversationMember.delete).toHaveBeenCalledWith({
        where: {
          conversationId_userId: {
            conversationId,
            userId: memberId,
          },
        },
      });
    });

    it('rejects a regular member', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.MEMBER }],
      });

      await expect(
        service.removeMember(memberId, conversationId, adminId),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.conversationMember.delete).not.toHaveBeenCalled();
    });

    it('rejects removing yourself', async () => {
      await expect(
        service.removeMember(adminId, conversationId, adminId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.conversationMember.delete).not.toHaveBeenCalled();
    });

    it('rejects a target who is not a member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.removeMember(adminId, conversationId, memberId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.conversationMember.delete).not.toHaveBeenCalled();
    });

    it('rejects removing members from a direct conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.DIRECT,
        members: [{ role: ConversationRole.ADMIN }],
      });

      await expect(
        service.removeMember(adminId, conversationId, memberId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.conversationMember.delete).not.toHaveBeenCalled();
    });
  });

  describe('addMember', () => {
    const conversationId = 'group-1';
    const adminId = 'admin-1';
    const memberId = 'member-1';

    beforeEach(() => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.ADMIN }],
      });

      prisma.conversationMember.findUnique.mockResolvedValue(null);

      prisma.conversationMember.create.mockResolvedValue({
        conversationId,
        userId: memberId,
        role: ConversationRole.MEMBER,
      });
    });

    it('allows an admin to add a member', async () => {
      await expect(
        service.addMember(adminId, conversationId, memberId),
      ).resolves.toEqual({
        conversationId,
        userId: memberId,
        role: ConversationRole.MEMBER,
      });

      expect(prisma.conversationMember.create).toHaveBeenCalledWith({
        data: {
          conversationId,
          userId: memberId,
          role: ConversationRole.MEMBER,
        },
      });
    });

    it('rejects a regular member', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.MEMBER }],
      });

      await expect(
        service.addMember(memberId, conversationId, adminId),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.conversationMember.create).not.toHaveBeenCalled();
    });

    it('rejects adding an existing member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: 'existing-membership',
      });

      await expect(
        service.addMember(adminId, conversationId, memberId),
      ).rejects.toThrow(ConflictException);

      expect(prisma.conversationMember.create).not.toHaveBeenCalled();
    });

    it('rejects adding members to a direct conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.DIRECT,
        members: [{ role: ConversationRole.ADMIN }],
      });

      await expect(
        service.addMember(adminId, conversationId, memberId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.conversationMember.create).not.toHaveBeenCalled();
    });

    it('rejects a conversation that does not exist', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.addMember(adminId, conversationId, memberId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.conversationMember.create).not.toHaveBeenCalled();
    });
  });

  describe('leaveGroup', () => {
    const conversationId = 'group-1';
    const adminId = 'admin-1';
    const memberId = 'member-1';

    const tx = {
      conversationMember: {
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    beforeEach(() => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.MEMBER }],
      });

      prisma.$transaction.mockImplementation(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      );

      tx.conversationMember.findFirst.mockReset();
      tx.conversationMember.update.mockReset();
      tx.conversationMember.delete.mockReset();
    });

    it('allows a regular member to leave a group', async () => {
      await expect(
        service.leaveGroup(memberId, conversationId),
      ).resolves.toEqual({
        message: 'You left the group successfully',
      });

      expect(tx.conversationMember.delete).toHaveBeenCalledWith({
        where: {
          conversationId_userId: {
            conversationId,
            userId: memberId,
          },
        },
      });

      expect(tx.conversationMember.findFirst).not.toHaveBeenCalled();
    });

    it('transfers admin role to the oldest remaining member', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.ADMIN }],
      });

      tx.conversationMember.findFirst.mockResolvedValue({
        id: 'oldest-member',
      });

      await service.leaveGroup(adminId, conversationId);

      expect(tx.conversationMember.findFirst).toHaveBeenCalledWith({
        where: {
          conversationId,
          userId: { not: adminId },
        },
        orderBy: { joinedAt: 'asc' },
      });

      expect(tx.conversationMember.update).toHaveBeenCalledWith({
        where: { id: 'oldest-member' },
        data: { role: ConversationRole.ADMIN },
      });
    });

    it('rejects when the only admin tries to leave', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [{ role: ConversationRole.ADMIN }],
      });

      tx.conversationMember.findFirst.mockResolvedValue(null);

      await expect(service.leaveGroup(adminId, conversationId)).rejects.toThrow(
        BadRequestException,
      );

      expect(tx.conversationMember.delete).not.toHaveBeenCalled();
    });

    it('rejects a non-member', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.GROUP,
        members: [],
      });

      await expect(
        service.leaveGroup('outsider-1', conversationId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects leaving a direct conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        type: ConversationType.DIRECT,
        members: [{ role: ConversationRole.MEMBER }],
      });

      await expect(
        service.leaveGroup(memberId, conversationId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getConversation', () => {
    const conversationId = 'group-1';
    const userId = 'member-1';

    it('allows a member to access the conversation', async () => {
      const conversation = {
        id: conversationId,
        type: ConversationType.GROUP,
        members: [{ userId }],
        messages: [],
      };

      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await expect(
        service.getConversation(conversationId, userId),
      ).resolves.toEqual(conversation);

      expect(prisma.conversation.findFirst).toHaveBeenCalled();
    });

    it('returns null for a non-member', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getConversation(conversationId, 'outsider-1'),
      ).resolves.toBeNull();
    });

    it('returns null when the conversation does not exist', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getConversation('missing-group', userId),
      ).resolves.toBeNull();
    });
  });

  describe('getUserConversations', () => {
    const userId = 'user-1';

    it('returns conversations belonging to the user', async () => {
      const conversations = [
        {
          id: 'group-1',
          type: ConversationType.GROUP,
          members: [{ userId }],
        },
        {
          id: 'direct-1',
          type: ConversationType.DIRECT,
          members: [{ userId }],
        },
      ];

      prisma.conversation.findMany.mockResolvedValue(conversations);

      await expect(service.getUserConversations(userId)).resolves.toEqual(
        conversations,
      );

      expect(prisma.conversation.findMany).toHaveBeenCalledWith({
        where: {
          members: {
            some: { userId },
          },
        },
        include: { members: true },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('returns an empty array when the user has no conversations', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await expect(service.getUserConversations(userId)).resolves.toEqual([]);
    });
  });

  describe('createGroup', () => {
    const callerId = 'user-1';
    const memberIds = ['user-2', 'user-3'];
    const dto = {
      name: 'Engineering Team',
      memberIds,
    };

    beforeEach(() => {
      prisma.conversation.create.mockReset();
    });

    it('creates a group with the caller as ADMIN and other users as MEMBER', async () => {
      const conversation = {
        id: 'group-1',
        type: ConversationType.GROUP,
        name: 'Engineering Team',
        members: [
          { userId: callerId, role: ConversationRole.ADMIN },
          { userId: 'user-2', role: ConversationRole.MEMBER },
          { userId: 'user-3', role: ConversationRole.MEMBER },
        ],
      };

      prisma.conversation.create.mockResolvedValue(conversation);

      await expect(service.createGroup(callerId, dto)).resolves.toEqual(
        conversation,
      );

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          type: ConversationType.GROUP,
          name: 'Engineering Team',
          members: {
            create: [
              { userId: callerId, role: ConversationRole.ADMIN },
              { userId: 'user-2' },
              { userId: 'user-3' },
            ],
          },
        },
        include: { members: true },
      });
    });

    it('deduplicates member IDs', async () => {
      prisma.conversation.create.mockResolvedValue({ id: 'group-1' });

      await service.createGroup(callerId, {
        name: 'Engineering Team',
        memberIds: ['user-2', 'user-2', 'user-3'],
      });

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            members: {
              create: [
                { userId: callerId, role: ConversationRole.ADMIN },
                { userId: 'user-2' },
                { userId: 'user-3' },
              ],
            },
          }),
        }),
      );
    });

    it('does not add the caller twice when caller ID is in memberIds', async () => {
      prisma.conversation.create.mockResolvedValue({ id: 'group-1' });

      await service.createGroup(callerId, {
        name: 'Engineering Team',
        memberIds: [callerId, 'user-2', 'user-3'],
      });

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            members: {
              create: [
                { userId: callerId, role: ConversationRole.ADMIN },
                { userId: 'user-2' },
                { userId: 'user-3' },
              ],
            },
          }),
        }),
      );
    });

    it('rejects a group with fewer than two other unique members', async () => {
      await expect(
        service.createGroup(callerId, {
          name: 'Engineering Team',
          memberIds: ['user-2'],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createGroup(callerId, {
          name: 'Engineering Team',
          memberIds: [callerId, 'user-2'],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('propagates database errors', async () => {
      const error = new Error('Database unavailable');
      prisma.conversation.create.mockRejectedValue(error);

      await expect(service.createGroup(callerId, dto)).rejects.toThrow(error);
    });
  });

  describe('createDirect', () => {
    const callerId = 'user-1';
    const recipientId = 'user-2';
    const dto = { recipientId };

    beforeEach(() => {
      prisma.conversation.findUnique.mockReset();
      prisma.conversation.create.mockReset();
    });

    it('creates a direct conversation with both users', async () => {
      const conversation = {
        id: 'direct-1',
        type: ConversationType.DIRECT,
        directKey: 'user-1:user-2',
        members: [{ userId: callerId }, { userId: recipientId }],
      };

      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue(conversation);

      await expect(service.createDirect(callerId, dto)).resolves.toEqual(
        conversation,
      );

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          type: ConversationType.DIRECT,
          directKey: 'user-1:user-2',
          members: {
            create: [{ userId: callerId }, { userId: recipientId }],
          },
        },
        include: { members: true },
      });
    });

    it('rejects creating a conversation with yourself', async () => {
      await expect(
        service.createDirect(callerId, { recipientId: callerId }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('returns an existing direct conversation', async () => {
      const existing = {
        id: 'direct-existing',
        type: ConversationType.DIRECT,
        directKey: 'user-1:user-2',
        members: [{ userId: callerId }, { userId: recipientId }],
      };

      prisma.conversation.findUnique.mockResolvedValue(existing);

      await expect(service.createDirect(callerId, dto)).resolves.toEqual(
        existing,
      );

      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('returns the existing conversation after a concurrent creation conflict', async () => {
      const existing = {
        id: 'direct-existing',
        type: ConversationType.DIRECT,
        directKey: 'user-1:user-2',
        members: [{ userId: callerId }, { userId: recipientId }],
      };

      const conflictError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: Prisma.prismaVersion.client,
        },
      );

      prisma.conversation.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);

      prisma.conversation.create.mockRejectedValue(conflictError);

      await expect(service.createDirect(callerId, dto)).resolves.toEqual(
        existing,
      );

      expect(prisma.conversation.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
