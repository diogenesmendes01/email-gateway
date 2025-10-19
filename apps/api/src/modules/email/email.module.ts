import { Module } from '@nestjs/common';
import { EmailController } from './controllers/email.controller';
import { EmailService } from './services/email.service';

// TODO: Add Bull Queue integration for async email processing (POST endpoint)
// TODO: Add AWS SES or Nodemailer provider (Worker implementation)
@Module({
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
