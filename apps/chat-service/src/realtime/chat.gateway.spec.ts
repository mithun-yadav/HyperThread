import { ConflictException, NotFoundException } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessageService } from '../message/message.service';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket, Server } from 'socket.io';
import { MessageEventsService } from '../message/message-events.service';

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  const messageService = {
    sendMessage: jest.fn(),
    acknowledgeDelivery: jest.fn(),
    acknowledgeRead: jest.fn(),
    checkMembership: jest.fn(),
  };

  const redisService = {
    refreshSocketPresence: jest.fn(),
    consumeRateLimit: jest.fn(),
  } as unknown as RedisService;
  const jwtService = {} as JwtService;
  const configService = {} as ConfigService;

  const server = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const messageEventsService = {
      registerMessageEditedHandler: jest.fn(),
      emitMessageEdited: jest.fn(),
      registerMessageDeleteHandler: jest.fn(),
      emitMessageDeleted: jest.fn(),
    } as unknown as MessageEventsService;

    gateway = new ChatGateway(
      jwtService,
      configService,
      messageService as unknown as MessageService,
      redisService,
      messageEventsService,
    );

    gateway.server = server as unknown as Server;
  });

  it('emits messageDelivered after successful acknowledgement', async () => {
    const message = {
      id: 'acd3c94e-f961-46ae-9101-c6628f6419b1',
      conversationId: 'decdaa67-4c8c-4c65-964d-e01482a6cd49',
      senderId: '399ba8fd-7169-46d9-93cf-e25ea94a00b9',
      status: 'DELIVERED',
    };

    messageService.acknowledgeDelivery.mockResolvedValue(message);

    const client = {
      data: { userId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8' },
    } as unknown as Socket;

    const result = await gateway.handleAcknowledgeDelivery(client, message.id);

    expect(messageService.acknowledgeDelivery).toHaveBeenCalledWith(
      message.id,
      client.data.userId,
    );

    expect(server.to).toHaveBeenCalledWith(message.conversationId);
    expect(server.emit).toHaveBeenCalledWith('messageDelivered', {
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      status: message.status,
    });

    expect(result).toEqual({
      event: 'deliveryAcknowledged',
      data: {
        messageId: message.id,
        status: message.status,
      },
    });
  });

  it('maps a missing message to MESSAGE_NOT_FOUND', async () => {
    messageService.acknowledgeDelivery.mockRejectedValue(
      new NotFoundException(),
    );

    const client = {
      data: { userId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8' },
    } as unknown as Socket;

    await expect(
      gateway.handleAcknowledgeDelivery(
        client,
        'acd3c94e-f961-46ae-9101-c6628f6419b1',
      ),
    ).rejects.toMatchObject({
      error: {
        errorCode: 'MESSAGE_NOT_FOUND',
      },
    });
  });

  it('maps sender acknowledgement to SENDER_CANNOT_ACKNOWLEDGE', async () => {
    messageService.acknowledgeDelivery.mockRejectedValue(
      new ConflictException(),
    );

    const client = {
      data: { userId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8' },
    } as unknown as Socket;

    await expect(
      gateway.handleAcknowledgeDelivery(
        client,
        'acd3c94e-f961-46ae-9101-c6628f6419b1',
      ),
    ).rejects.toMatchObject({
      error: {
        errorCode: 'SENDER_CANNOT_ACKNOWLEDGE',
      },
    });
  });

  it('rejects an unauthenticated socket from sending messages', async () => {
    const client = {
      data: {},
    } as unknown as Socket;

    await expect(
      gateway.handleSendMessage(client, {
        conversationId: 'decdaa67-4c8c-4c65-964d-e01482a6cd49',
        content: 'Hello',
        idempotencyKey: 'test-key',
      }),
    ).rejects.toMatchObject({
      error: {
        errorCode: 'UNAUTHORIZED',
      },
    });
  });

  it('rejects messages when the rate limit is exceeded', async () => {
    const client = {
      data: { userId: 'user-1' },
    } as unknown as Socket;

    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce(false);

    await expect(
      gateway.handleSendMessage(client, {
        conversationId: 'decdaa67-4c8c-4c65-964d-e01482a6cd49',
        content: 'Hello',
        idempotencyKey: 'test-key',
      }),
    ).rejects.toMatchObject({
      error: {
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
    });

    expect(redisService.consumeRateLimit).toHaveBeenCalledWith(
      'rate-limit:ws:send-message:user-1',
      10,
      60,
    );

    expect(messageService.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated heartbeat', async () => {
    const client = {
      id: 'socket-1',
      data: {},
    } as unknown as Socket;

    await expect(gateway.handleHeartbeat(client)).rejects.toMatchObject({
      error: {
        errorCode: 'UNAUTHORIZED',
      },
    });

    expect(
      (redisService.refreshSocketPresence as jest.Mock).mock.calls,
    ).toHaveLength(0);
  });

  it('returns INTERNAL_ERROR when heartbeat presence refresh fails', async () => {
    const client = {
      id: 'socket-1',
      data: { userId: 'user-1' },
    } as unknown as Socket;

    (redisService.refreshSocketPresence as jest.Mock).mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );

    await expect(gateway.handleHeartbeat(client)).rejects.toMatchObject({
      error: {
        errorCode: 'INTERNAL_ERROR',
      },
    });
  });

  it('emits messageRead after successful acknowledgement', async () => {
    const message = {
      id: 'acd3c94e-f961-46ae-9101-c6628f6419b1',
      conversationId: 'decdaa67-4c8c-4c65-964d-e01482a6cd49',
      senderId: '399ba8fd-7169-46d9-93cf-e25ea94a00b9',
      status: 'READ',
    };

    messageService.acknowledgeRead.mockResolvedValue(message);

    const client = {
      data: { userId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8' },
    } as unknown as Socket;

    const result = await gateway.handleAcknowledgeRead(client, message.id);

    expect(messageService.acknowledgeRead).toHaveBeenCalledWith(
      message.id,
      client.data.userId,
    );

    expect(server.to).toHaveBeenCalledWith(message.conversationId);
    expect(server.emit).toHaveBeenCalledWith('messageRead', {
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      status: 'READ',
    });

    expect(result).toEqual({
      event: 'readAcknowledged',
      data: {
        messageId: message.id,
        status: 'READ',
      },
    });
  });

  it('rejects an unauthenticated read acknowledgement', async () => {
    const client = {
      data: {},
    } as unknown as Socket;

    await expect(
      gateway.handleAcknowledgeRead(
        client,
        'acd3c94e-f961-46ae-9101-c6628f6419b1',
      ),
    ).rejects.toMatchObject({
      error: {
        errorCode: 'UNAUTHORIZED',
      },
    });

    expect(messageService.acknowledgeRead).not.toHaveBeenCalled();
  });

  it('maps a missing read-receipt message to MESSAGE_NOT_FOUND', async () => {
    messageService.acknowledgeRead.mockRejectedValue(new NotFoundException());

    const client = {
      data: { userId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8' },
    } as unknown as Socket;

    await expect(
      gateway.handleAcknowledgeRead(
        client,
        'acd3c94e-f961-46ae-9101-c6628f6419b1',
      ),
    ).rejects.toMatchObject({
      error: {
        errorCode: 'MESSAGE_NOT_FOUND',
      },
    });
  });

  it('maps sender read acknowledgement to SENDER_CANNOT_ACKNOWLEDGE', async () => {
    messageService.acknowledgeRead.mockRejectedValue(new ConflictException());

    const client = {
      data: { userId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8' },
    } as unknown as Socket;

    await expect(
      gateway.handleAcknowledgeRead(
        client,
        'acd3c94e-f961-46ae-9101-c6628f6419b1',
      ),
    ).rejects.toMatchObject({
      error: {
        errorCode: 'SENDER_CANNOT_ACKNOWLEDGE',
      },
    });
  });

  it('broadcasts typing to other conversation members', async () => {
    const conversationId = 'decdaa67-4c8c-4c65-964d-e01482a6cd49';
    const userId = 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8';

    messageService.checkMembership.mockResolvedValue(undefined);

    const client = {
      data: { userId },
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as unknown as Socket;

    const result = await gateway.handleTyping(client, conversationId);

    expect(messageService.checkMembership).toHaveBeenCalledWith(
      conversationId,
      userId,
    );
    expect(client.to).toHaveBeenCalledWith(conversationId);
    expect(result).toEqual({
      event: 'typingAcknowledged',
      data: { conversationId },
    });
  });

  it('rejects an unauthenticated typing event', async () => {
    const client = { data: {} } as unknown as Socket;

    await expect(
      gateway.handleTyping(client, 'decdaa67-4c8c-4c65-964d-e01482a6cd49'),
    ).rejects.toMatchObject({
      error: { errorCode: 'UNAUTHORIZED' },
    });

    expect(messageService.checkMembership).not.toHaveBeenCalled();
  });

  it('broadcasts stopTyping to other conversation members', async () => {
    const conversationId = 'decdaa67-4c8c-4c65-964d-e01482a6cd49';
    const userId = 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8';
    const emit = jest.fn();

    messageService.checkMembership.mockResolvedValue(undefined);

    const client = {
      data: { userId },
      to: jest.fn().mockReturnValue({ emit }),
    } as unknown as Socket;

    const result = await gateway.handleStopTyping(client, conversationId);

    expect(messageService.checkMembership).toHaveBeenCalledWith(
      conversationId,
      userId,
    );
    expect(client.to).toHaveBeenCalledWith(conversationId);
    expect(emit).toHaveBeenCalledWith('userStoppedTyping', {
      conversationId,
      userId,
    });
    expect(result).toEqual({
      event: 'stopTypingAcknowledged',
      data: { conversationId },
    });
  });

  it('rejects typing events from non-members', async () => {
    const conversationId = 'decdaa67-4c8c-4c65-964d-e01482a6cd49';

    messageService.checkMembership.mockRejectedValue(new NotFoundException());

    const client = {
      data: { userId: 'a0f55a23-b2cb-4b87-b1a4-a7f02b37b3d8' },
      to: jest.fn(),
    } as unknown as Socket;

    await expect(
      gateway.handleTyping(client, conversationId),
    ).rejects.toMatchObject({
      error: { errorCode: 'CONVERSATION_NOT_FOUND' },
    });

    expect(client.to).not.toHaveBeenCalled();
  });

  it('disconnects a socket with a token signed using an unsupported algorithm', async () => {
    const realJwtService = new JwtService({
      secret: 'test-secret',
      signOptions: { algorithm: 'HS384' },
    });

    const realConfigService = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;

    const realGateway = new ChatGateway(
      realJwtService,
      realConfigService,
      messageService as unknown as MessageService,
      redisService,
      {
        registerMessageEditedHandler: jest.fn(),
        emitMessageEdited: jest.fn(),
        registerMessageDeleteHandler: jest.fn(),
        emitMessageDeleted: jest.fn(),
      } as unknown as MessageEventsService,
    );

    const token = realJwtService.sign({ sub: 'user-1' });
    const disconnect = jest.fn();

    const client = {
      handshake: { auth: { token } },
      disconnect,
      data: {},
      id: 'socket-1',
    } as unknown as Socket;

    await realGateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalled();
    expect(client.data.userId).toBeUndefined();
  });
});
