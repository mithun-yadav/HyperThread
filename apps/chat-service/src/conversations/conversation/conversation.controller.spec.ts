import { Test, TestingModule } from '@nestjs/testing';
import { CanActivate, NotFoundException } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversations.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('ConversationController', () => {
  let controller: ConversationController;

  const conversationService = {
    getConversation: jest.fn(),
    getUserConversations: jest.fn(),
    createDirect: jest.fn(),
    createGroup: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    leaveGroup: jest.fn(),
    renameGroup: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [
        {
          provide: ConversationService,
          useValue: conversationService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true } satisfies CanActivate)
      .compile();

    controller = module.get<ConversationController>(ConversationController);
  });

  describe('getConversation', () => {
    const conversationId = 'conversation-1';
    const userId = 'user-1';

    it('returns the conversation for a member', async () => {
      const conversation = {
        id: conversationId,
        type: 'GROUP',
        name: 'Engineering',
        members: [{ userId }],
      };

      conversationService.getConversation.mockResolvedValue(conversation);

      const result = await controller.getConversation(
        { user: { sub: userId } } as never,
        conversationId,
      );

      expect(result).toEqual(conversation);
      expect(conversationService.getConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
      );
    });

    it('returns 404 when the conversation does not exist', async () => {
      conversationService.getConversation.mockResolvedValue(null);

      await expect(
        controller.getConversation(
          { user: { sub: userId } } as never,
          conversationId,
        ),
      ).rejects.toThrow(new NotFoundException('Conversation not found'));
    });

    it('returns 404 when the caller is not a member', async () => {
      conversationService.getConversation.mockResolvedValue(null);

      await expect(
        controller.getConversation(
          { user: { sub: 'outsider-1' } } as never,
          conversationId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserConversations', () => {
    it('returns conversations for the authenticated user', async () => {
      const userId = 'user-1';
      const conversations = [{ id: 'conversation-1' }];

      conversationService.getUserConversations.mockResolvedValue(conversations);

      await expect(
        controller.getUserConversations({ user: { sub: userId } } as never),
      ).resolves.toEqual(conversations);

      expect(conversationService.getUserConversations).toHaveBeenCalledWith(
        userId,
      );
    });
  });

  describe('createDirect', () => {
    it('creates a direct conversation for the authenticated user', async () => {
      const userId = 'user-1';
      const dto = { recipientId: 'user-2' };
      const conversation = { id: 'direct-1' };

      conversationService.createDirect.mockResolvedValue(conversation);

      await expect(
        controller.createDirect({ user: { sub: userId } } as never, dto),
      ).resolves.toEqual(conversation);

      expect(conversationService.createDirect).toHaveBeenCalledWith(
        userId,
        dto,
      );
    });
  });

  describe('createGroup', () => {
    it('creates a group for the authenticated user', async () => {
      const userId = 'user-1';
      const dto = {
        name: 'Engineering',
        memberIds: ['user-2', 'user-3'],
      };
      const conversation = { id: 'group-1' };

      conversationService.createGroup.mockResolvedValue(conversation);

      await expect(
        controller.createGroup({ user: { sub: userId } } as never, dto),
      ).resolves.toEqual(conversation);

      expect(conversationService.createGroup).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('addMember', () => {
    it('passes the authenticated user and target member to the service', async () => {
      const userId = 'admin-1';
      const conversationId = 'group-1';
      const dto = { userId: 'member-1' };
      const result = { userId: dto.userId };

      conversationService.addMember.mockResolvedValue(result);

      await expect(
        controller.addMember(
          { user: { sub: userId } } as never,
          conversationId,
          dto,
        ),
      ).resolves.toEqual(result);

      expect(conversationService.addMember).toHaveBeenCalledWith(
        userId,
        conversationId,
        dto.userId,
      );
    });
  });

  describe('removeMember', () => {
    it('passes the authenticated user and target member to the service', async () => {
      const userId = 'admin-1';
      const conversationId = 'group-1';
      const dto = { userId: 'member-1' };
      const result = { message: 'Member removed successfully' };

      conversationService.removeMember.mockResolvedValue(result);

      await expect(
        controller.removeMember(
          { user: { sub: userId } } as never,
          conversationId,
          dto,
        ),
      ).resolves.toEqual(result);

      expect(conversationService.removeMember).toHaveBeenCalledWith(
        userId,
        conversationId,
        dto.userId,
      );
    });
  });

  describe('leaveGroup', () => {
    it('passes the authenticated user and conversation to the service', async () => {
      const userId = 'user-1';
      const conversationId = 'group-1';
      const result = { message: 'You left the group successfully' };

      conversationService.leaveGroup.mockResolvedValue(result);

      await expect(
        controller.leaveGroup(
          { user: { sub: userId } } as never,
          conversationId,
        ),
      ).resolves.toEqual(result);

      expect(conversationService.leaveGroup).toHaveBeenCalledWith(
        userId,
        conversationId,
      );
    });
  });

  describe('renameGroup', () => {
    it('passes the authenticated user, conversation, and new name to the service', async () => {
      const userId = 'admin-1';
      const conversationId = 'group-1';
      const dto = { name: 'Platform Team' };
      const result = { id: conversationId, name: dto.name };

      conversationService.renameGroup.mockResolvedValue(result);

      await expect(
        controller.renameGroup(
          { user: { sub: userId } } as never,
          conversationId,
          dto,
        ),
      ).resolves.toEqual(result);

      expect(conversationService.renameGroup).toHaveBeenCalledWith(
        userId,
        conversationId,
        dto.name,
      );
    });
  });
});
