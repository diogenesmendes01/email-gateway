import { Module } from '@nestjs/common';
import { EmailController } from './controllers/email.controller';
import { EmailSendController } from './controllers/email-send.controller';
import { EmailService } from './services/email.service';
import { EmailSendService } from './services/email-send.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EmailController, EmailSendController],
  providers: [EmailService, EmailSendService],
  exports: [EmailService, EmailSendService],
})
export class EmailModule {}
