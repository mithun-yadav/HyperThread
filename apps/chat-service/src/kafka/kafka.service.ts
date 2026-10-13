import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private readonly producer: Producer;

  constructor(private readonly configService: ConfigService) {
    const brokers = this.configService
      .getOrThrow<string>('KAFKA_BROKERS')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    if (brokers.length === 0) {
      throw new Error('KAFKA_BROKERS must contain at least one broker');
    }
    const kafka = new Kafka({
      clientId: 'hyperthread-chat-service',
      brokers,
    });

    this.producer = kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.log('kafka producer connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  async publish(topic: string, event: Record<string, unknown>): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key:
              typeof event['aggregateId'] === 'string'
                ? event['aggregateId']
                : undefined,
            value: JSON.stringify(event),
          },
        ],
      });
    } catch (error) {
      this.logger.error(`Failed to publish event to topic "${topic}"`);
      throw new ServiceUnavailableException({
        message: 'Event publishing failed',
        errorCode: 'EVENT_PUBLISH_FAILED',
      });
    }
  }
}
