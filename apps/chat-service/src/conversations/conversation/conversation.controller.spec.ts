import { Test, TestingModule } from '@nestjs/testing';
import { CanActivate, NotFoundException } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversations.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('ConversationController', () => {
  let controller: ConversationController;

  const conversationService = {
    getConversation: jest.fn(),
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
});
