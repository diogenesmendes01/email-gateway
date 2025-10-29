import { Module } from '@nestjs/common';
import { EmailController } from './controllers/email.controller';
import { EmailSendController } from './controllers/email-send.controller';
import { BatchEmailController } from './controllers/batch-email.controller'; // TASK-025
import { EmailService } from './services/email.service';
import { EmailSendService } from './services/email-send.service';
import { BatchEmailService } from './services/batch-email.service'; // TASK-025
import { DailyQuotaService } from './services/daily-quota.service'; // TASK-029
import { ReputationMonitorService } from './services/reputation-monitor.service'; // TASK-030
import { ContentValidationService } from './services/content-validation.service'; // TASK-031
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { MetricsModule } from '../metrics/metrics.module';
import { WebhookModule } from '../webhook/webhook.module'; // TASK-023

@Module({
  imports: [AuthModule, QueueModule, MetricsModule, WebhookModule], // TASK-023 + TASK-025
  controllers: [EmailController, EmailSendController, BatchEmailController], // TASK-025
  providers: [
    EmailService,
    EmailSendService,
    BatchEmailService, // TASK-025
    DailyQuotaService, // TASK-029
    ReputationMonitorService, // TASK-030
    ContentValidationService, // TASK-031
  ],
  exports: [
    EmailService,
    EmailSendService,
    BatchEmailService, // TASK-025
    DailyQuotaService, // TASK-029
    ReputationMonitorService, // TASK-030
    ContentValidationService, // TASK-031
  ],
})
export class EmailModule {}
