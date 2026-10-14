import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MessageService } from '../message/message.service';
import {
  ConversationType,
  MessageStatus,
  Prisma,
} from '../generated/prisma/client';
describe('MessageService', () => {
  let service: MessageService;

  const prisma = {
    $transaction: jest.fn(),
    conversationMember: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new MessageService(prisma as any);
  });

  prisma.$transaction.mockImplementation(async (callback) =>
    callback({
      message: {
        create: prisma.message.create,
      },
      outboxEvent: {
        create: prisma.outboxEvent.create,
      },
    }),
  );

  const conversationId = 'decdaa67-4c8c-4c65-964d-e01482a6cd49';
  const userId = '399ba8fd-7169-46d9-93cf-e25ea94a00b9';
  const idempotencyKey = 'b1152b51-af8e-420c-8209-b98e0b82621d';

  const message = {
    id: 'acd3c94e-f961-46ae-9101-c6628f6419b1',
    conversationId,
    senderId: userId,
    content: 'Hello',
    idempotencyKey,
    createdAt: new Date(),
  };

  const createUniqueConstraintError = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: Prisma.prismaVersion.client,
    });

  beforeEach(() => {
    prisma.conversationMember.findUnique.mockResolvedValue({
      id: 'membership-id',
      conversationId,
      userId,
    });
  });

  it('creates a new message', async () => {
    prisma.message.create.mockResolvedValue(message);

    const result = await service.sendMessage(conversationId, userId, {
      content: 'Hello',
      idempotencyKey,
    });

    expect(result).toEqual({
      message,
      created: true,
    });

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('returns the existing message on idempotent retry', async () => {
    prisma.message.create.mockRejectedValue(createUniqueConstraintError());

    prisma.message.findUnique.mockResolvedValue(message);

    const result = await service.sendMessage(conversationId, userId, {
      content: 'Hello',
      idempotencyKey,
    });

    expect(result).toEqual({
      message,
      created: false,
    });

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for a different message', async () => {
    prisma.message.create.mockRejectedValue(createUniqueConstraintError());

    prisma.message.findUnique.mockResolvedValue({
      ...message,
      content: 'Different content',
    });

    await expect(
      service.sendMessage(conversationId, userId, {
        content: 'Hello',
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when no existing message is found after a unique constraint error', async () => {
    prisma.message.create.mockRejectedValue(createUniqueConstraintError());
    prisma.message.findUnique.mockResolvedValue(null);

    await expect(
      service.sendMessage(conversationId, userId, {
        content: 'Hello',
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('editMessage', () => {
    const editedContent = 'Updated message';

    it('allows the sender to edit their message', async () => {
      prisma.message.findFirst.mockResolvedValue(message);
      prisma.message.update.mockResolvedValue({
        ...message,
        content: editedContent,
        editedAt: new Date(),
      });

      const result = await service.editMessage(
        conversationId,
        message.id,
        userId,
        { content: editedContent },
      );

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: message.id },
        data: {
          content: editedContent,
          editedAt: expect.any(Date),
        },
      });
      expect(result.content).toBe(editedContent);
    });

    it('rejects editing another users message', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...message,
        senderId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8',
      });

      await expect(
        service.editMessage(conversationId, message.id, userId, {
          content: editedContent,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rejects editing a message that does not exist in the conversation', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.editMessage(conversationId, message.id, userId, {
          content: editedContent,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects editing when the caller is not a conversation member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.editMessage(conversationId, message.id, userId, {
          content: editedContent,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.message.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('acknowledgeDelivery', () => {
    const recipientId = 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8';

    const directMessage = {
      ...message,
      status: MessageStatus.SENT,
      conversation: {
        type: ConversationType.DIRECT,
        members: [{ userId }, { userId: recipientId }],
      },
    };

    it('marks a direct message as delivered by its recipient', async () => {
      prisma.message.findUnique
        .mockResolvedValueOnce(directMessage)
        .mockResolvedValueOnce({
          ...message,
          status: MessageStatus.DELIVERED,
        });
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.acknowledgeDelivery(message.id, recipientId);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          id: message.id,
          status: MessageStatus.SENT,
        },
        data: { status: MessageStatus.DELIVERED },
      });
      expect(result.status).toBe(MessageStatus.DELIVERED);
    });

    it('rejects the sender acknowledging their own message', async () => {
      prisma.message.findUnique.mockResolvedValue(directMessage);

      await expect(
        service.acknowledgeDelivery(message.id, userId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a non-member', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...directMessage,
        conversation: {
          ...directMessage.conversation,
          members: [{ userId }],
        },
      });

      await expect(
        service.acknowledgeDelivery(message.id, recipientId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects acknowledgement for a group message', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...directMessage,
        conversation: {
          ...directMessage.conversation,
          type: ConversationType.GROUP,
        },
      });

      await expect(
        service.acknowledgeDelivery(message.id, recipientId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.acknowledgeDelivery(message.id, recipientId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('keeps an already delivered message delivered on duplicate acknowledgement', async () => {
      prisma.message.findUnique
        .mockResolvedValueOnce({
          ...directMessage,
          status: MessageStatus.DELIVERED,
        })
        .mockResolvedValueOnce({
          ...message,
          status: MessageStatus.DELIVERED,
        });
      prisma.message.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.acknowledgeDelivery(message.id, recipientId);

      expect(result.status).toBe(MessageStatus.DELIVERED);
    });
  });

  describe('acknowledgeRead', () => {
    const recipientId = 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8';

    const directMessage = {
      ...message,
      status: MessageStatus.SENT,
      conversation: {
        type: ConversationType.DIRECT,
        members: [{ userId }, { userId: recipientId }],
      },
    };

    it('marks a SENT direct message as READ', async () => {
      prisma.message.findUnique
        .mockResolvedValueOnce(directMessage)
        .mockResolvedValueOnce({
          ...message,
          status: MessageStatus.READ,
        });
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.acknowledgeRead(message.id, recipientId);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          id: message.id,
          status: {
            in: [MessageStatus.SENT, MessageStatus.DELIVERED],
          },
        },
        data: {
          status: MessageStatus.READ,
        },
      });
      expect(result.status).toBe(MessageStatus.READ);
    });

    it('marks a DELIVERED direct message as READ', async () => {
      prisma.message.findUnique
        .mockResolvedValueOnce({
          ...directMessage,
          status: MessageStatus.DELIVERED,
        })
        .mockResolvedValueOnce({
          ...message,
          status: MessageStatus.READ,
        });
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.acknowledgeRead(message.id, recipientId);

      expect(result.status).toBe(MessageStatus.READ);
    });

    it('rejects the sender acknowledging their own message', async () => {
      prisma.message.findUnique.mockResolvedValue(directMessage);

      await expect(
        service.acknowledgeRead(message.id, userId),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a non-member', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...directMessage,
        conversation: {
          ...directMessage.conversation,
          members: [{ userId }],
        },
      });

      await expect(
        service.acknowledgeRead(message.id, recipientId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('rejects acknowledgement for a group message', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...directMessage,
        conversation: {
          ...directMessage.conversation,
          type: ConversationType.GROUP,
        },
      });

      await expect(
        service.acknowledgeRead(message.id, recipientId),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.acknowledgeRead(message.id, recipientId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('keeps an already READ message READ on duplicate acknowledgement', async () => {
      prisma.message.findUnique
        .mockResolvedValueOnce({
          ...directMessage,
          status: MessageStatus.READ,
        })
        .mockResolvedValueOnce({
          ...message,
          status: MessageStatus.READ,
        });
      prisma.message.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.acknowledgeRead(message.id, recipientId);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          id: message.id,
          status: {
            in: [MessageStatus.SENT, MessageStatus.DELIVERED],
          },
        },
        data: {
          status: MessageStatus.READ,
        },
      });
      expect(result.status).toBe(MessageStatus.READ);
    });
  });

  describe('deleteMessage', () => {
    it('allows the sender to delete their message', async () => {
      const deletedAt = new Date();

      prisma.message.findFirst.mockResolvedValue(message);
      prisma.message.update.mockResolvedValue({
        ...message,
        content: '',
        deletedAt,
      });

      const result = await service.deleteMessage(
        conversationId,
        message.id,
        userId,
      );

      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: {
          id: message.id,
          conversationId,
        },
      });

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: message.id },
        data: {
          content: '',
          deletedAt: expect.any(Date),
        },
      });

      expect(result.content).toBe('');
      expect(result.deletedAt).toBeInstanceOf(Date);
    });

    it('rejects deleting another user’s message', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...message,
        senderId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8',
      });

      await expect(
        service.deleteMessage(conversationId, message.id, userId),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rejects deleting a message that does not exist', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteMessage(conversationId, message.id, userId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rejects deleting an already deleted message', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...message,
        deletedAt: new Date(),
      });

      await expect(
        service.deleteMessage(conversationId, message.id, userId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rejects deleting when the caller is not a conversation member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteMessage(conversationId, message.id, userId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.message.findFirst).not.toHaveBeenCalled();
    });
  });
});
