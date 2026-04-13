import { Module } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { RateLimitController } from './rate-limit.controller';
import { RateLimitService } from './rate-limit.service';

@Module({
  imports: [AuthModule],
  controllers: [RateLimitController],
  providers: [RateLimitService, PrismaService],
  exports: [RateLimitService],
})
export class RateLimitModule {}

