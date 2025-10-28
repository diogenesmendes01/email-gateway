/**
 * TASK-021: Admin Module
 *
 * Provides administrative endpoints for system management
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminDLQController } from './controllers/admin-dlq.controller';
import { AdminDLQService } from './services/admin-dlq.service';
import { AdminGuard } from './guards/admin.guard';

@Module({
  imports: [ConfigModule],
  controllers: [AdminDLQController],
  providers: [AdminDLQService, AdminGuard],
  exports: [AdminDLQService],
})
export class AdminModule {}
