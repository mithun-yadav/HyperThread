import { ConflictException } from '@nestjs/common';
import { MessageService } from '../message/message.service';

describe('MessageService', () => {
  let service: MessageService;

  const prisma = {
    conversationMember: {
      findUnique: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findUnique: jest.fn(),
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
    prisma.message.create.mockRejectedValue({
      code: 'P2002',
    });

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
    prisma.message.create.mockRejectedValue({
      code: 'P2002',
    });

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
});
