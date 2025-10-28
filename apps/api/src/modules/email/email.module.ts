import { Module } from '@nestjs/common';
import { EmailController } from './controllers/email.controller';
import { EmailSendController } from './controllers/email-send.controller';
import { EmailService } from './services/email.service';
import { EmailSendService } from './services/email-send.service';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [AuthModule, QueueModule, MetricsModule],
  controllers: [EmailController, EmailSendController],
  providers: [EmailService, EmailSendService],
  exports: [EmailService, EmailSendService],
})
export class EmailModule {}
