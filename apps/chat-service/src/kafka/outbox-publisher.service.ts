import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from './kafka.service';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer: NodeJS.Timeout | undefined;
  private isPublishing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaService: KafkaService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.publishPendingEvent();
    }, 1000);

    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async publishPendingEvent(): Promise<void> {
    if (this.isPublishing) return;

    this.isPublishing = true;

    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      for (const event of events) {
        try {
          await this.kafkaService.publish(event.eventType, {
            ...(event.payload as Record<string, unknown>),
            eventId: event.id,
          });

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { publishedAt: new Date() },
          });
        } catch {
          this.logger.error(
            `Failed to publish outbox event ${event.id}; it will be retried`,
          );
          break;
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to read pending outbox events',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isPublishing = false;
    }
  }
}
