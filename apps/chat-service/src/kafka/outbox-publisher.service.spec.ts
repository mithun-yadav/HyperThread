import { OutboxPublisherService } from './outbox-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from './kafka.service';

describe('OutboxPublisherService', () => {
  let service: OutboxPublisherService;

  let prisma: {
    outboxEvent: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  let kafkaService: {
    publish: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      outboxEvent: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    kafkaService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    service = new OutboxPublisherService(
      prisma as unknown as PrismaService,
      kafkaService as unknown as KafkaService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('publishes pending events and marks them as published', async () => {
    const event = {
      id: 'event-1',
      eventType: 'MessageCreated',
      aggregateId: 'conversation-1',
      payload: { messageId: 'message-1' },
      createdAt: new Date(),
      publishedAt: null,
    };

    prisma.outboxEvent.findMany.mockResolvedValue([event]);
    prisma.outboxEvent.update.mockResolvedValue({
      ...event,
      publishedAt: new Date(),
    });

    await service.publishPendingEvent();

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    expect(kafkaService.publish).toHaveBeenCalledWith('MessageCreated', {
      messageId: 'message-1',
      eventId: 'event-1',
    });

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('stops the batch when publishing fails', async () => {
    const events = [
      {
        id: 'event-1',
        eventType: 'MessageCreated',
        aggregateId: 'conversation-1',
        payload: { messageId: 'message-1' },
        createdAt: new Date(),
        publishedAt: null,
      },
      {
        id: 'event-2',
        eventType: 'MessageCreated',
        aggregateId: 'conversation-2',
        payload: { messageId: 'message-2' },
        createdAt: new Date(),
        publishedAt: null,
      },
    ];

    prisma.outboxEvent.findMany.mockResolvedValue(events);
    kafkaService.publish.mockRejectedValue(new Error('Kafka unavailable'));

    await service.publishPendingEvent();

    expect(kafkaService.publish).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('does not process overlapping polls', async () => {
    let resolveEvents!: (events: never[]) => void;

    prisma.outboxEvent.findMany.mockReturnValue(
      new Promise<never[]>((resolve) => {
        resolveEvents = resolve;
      }),
    );

    const firstPoll = service.publishPendingEvent();
    const secondPoll = service.publishPendingEvent();

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(1);

    resolveEvents([]);
    await Promise.all([firstPoll, secondPoll]);
  });

  it('leaves the event pending when marking it as published fails', async () => {
    const event = {
      id: 'event-1',
      eventType: 'MessageCreated',
      aggregateId: 'conversation-1',
      payload: { messageId: 'message-1' },
      createdAt: new Date(),
      publishedAt: null,
    };

    prisma.outboxEvent.findMany.mockResolvedValue([event]);
    prisma.outboxEvent.update.mockRejectedValue(
      new Error('Database unavailable'),
    );

    await service.publishPendingEvent();

    expect(kafkaService.publish).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { publishedAt: expect.any(Date) },
    });
  });
});
