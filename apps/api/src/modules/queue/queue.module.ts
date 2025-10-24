/**
 * TASK 8.2 - Queue Module
 *
 * Global module that provides QueueService to entire application
 */

import { Module, Global } from '@nestjs/common';
import { QueueService } from './queue.service';

@Global() // Make available everywhere without importing
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
