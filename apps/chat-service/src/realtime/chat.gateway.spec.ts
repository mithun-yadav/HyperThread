import { ConflictException, NotFoundException } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessageService } from '../message/message.service';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket, Server } from 'socket.io';

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  const messageService = {
    acknowledgeDelivery: jest.fn(),
  };

  const redisService = {} as RedisService;
  const jwtService = {} as JwtService;
  const configService = {} as ConfigService;

  const server = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    gateway = new ChatGateway(
      jwtService,
      configService,
      messageService as unknown as MessageService,
      redisService,
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
});
