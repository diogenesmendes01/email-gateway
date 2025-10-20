import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { QueueModule } from '../queue/queue.module';

// TODO: Implement health module with controllers and services
@Module({
  imports: [QueueModule],
  controllers: [HealthController],
  providers: [],
  exports: [],
})
export class HealthModule {}
