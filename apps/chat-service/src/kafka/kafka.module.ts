import { Global, Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { OutboxPublisherService } from './outbox-publisher.service';

@Global()
@Module({
  providers: [KafkaService, OutboxPublisherService],
  exports: [KafkaService],
})
export class KafkaModule {}
