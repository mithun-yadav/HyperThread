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
    conversationMember: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new MessageService(prisma as any);
  });

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
});
