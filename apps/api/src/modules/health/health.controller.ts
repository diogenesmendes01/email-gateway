import { Controller, Get } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';

@Controller('health')
export class HealthController {
  constructor(private readonly queueService: QueueService) {}

  @Get()
  async getHealth() {
    const queue = await this.queueService.getQueueHealth();
    return {
      status: 'ok',
      queue: {
        waiting: queue.waiting,
        active: queue.active,
        failed: queue.failed,
        delayed: queue.delayed,
        total: queue.total,
      },
    };
  }
}


