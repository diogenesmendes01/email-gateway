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
import { AdminController } from './controllers/admin.controller';
import { SandboxMonitorService } from './services/sandbox-monitor.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [AdminDLQController, AdminController],
  providers: [AdminDLQService, AdminGuard, SandboxMonitorService],
  exports: [AdminDLQService],
})
export class AdminModule {}
