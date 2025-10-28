import { Module } from '@nestjs/common';
import { EmailController } from './controllers/email.controller';
import { EmailSendController } from './controllers/email-send.controller';
import { BatchEmailController } from './controllers/batch-email.controller'; // TASK-025
import { EmailService } from './services/email.service';
import { EmailSendService } from './services/email-send.service';
import { BatchEmailService } from './services/batch-email.service'; // TASK-025
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [AuthModule, QueueModule, MetricsModule],
  controllers: [EmailController, EmailSendController, BatchEmailController], // TASK-025
  providers: [EmailService, EmailSendService, BatchEmailService], // TASK-025
  exports: [EmailService, EmailSendService, BatchEmailService], // TASK-025
})
export class EmailModule {}
