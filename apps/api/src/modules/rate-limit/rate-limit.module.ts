import { Module } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { RateLimitController } from './rate-limit.controller';
import { RateLimitService } from './rate-limit.service';

@Module({
  controllers: [RateLimitController],
  providers: [RateLimitService, PrismaService],
  exports: [RateLimitService],
})
export class RateLimitModule {}

