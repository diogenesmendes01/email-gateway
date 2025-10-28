/**
 * TASK-021: Admin DLQ Controller
 *
 * REST endpoints for Dead Letter Queue management
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { AdminDLQService } from '../services/admin-dlq.service';

@Controller('admin/dlq')
@UseGuards(AdminGuard)
export class AdminDLQController {
  constructor(private readonly adminDLQService: AdminDLQService) {}

  /**
   * GET /admin/dlq
   * List all failed jobs in DLQ
   */
  @Get()
  async listDLQ(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    const jobs = await this.adminDLQService.getDLQJobs(limitNum);

    return {
      total: jobs.length,
      jobs,
    };
  }

  /**
   * GET /admin/dlq/stats
   * Get DLQ statistics and health metrics
   */
  @Get('stats')
  async getStats() {
    const stats = await this.adminDLQService.getDLQStats();

    return {
      stats,
      health: this.evaluateHealth(stats),
    };
  }

  /**
   * GET /admin/dlq/:jobId
   * Get specific job details
   */
  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string) {
    const job = await this.adminDLQService.getJob(jobId);

    if (!job) {
      return {
        error: 'Job not found',
        jobId,
      };
    }

    return {
      id: job.id,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
      stacktrace: job.stacktrace,
      opts: job.opts,
    };
  }

  /**
   * POST /admin/dlq/:jobId/retry
   * Manually retry a failed job
   */
  @Post(':jobId/retry')
  @HttpCode(HttpStatus.OK)
  async retryJob(@Param('jobId') jobId: string) {
    await this.adminDLQService.retryJob(jobId);

    return {
      message: 'Job queued for retry',
      jobId,
      status: 'moved_to_waiting',
    };
  }

  /**
   * DELETE /admin/dlq/:jobId
   * Permanently remove a job from DLQ
   */
  @Delete(':jobId')
  @HttpCode(HttpStatus.OK)
  async removeJob(@Param('jobId') jobId: string) {
    await this.adminDLQService.removeJob(jobId);

    return {
      message: 'Job removed from DLQ',
      jobId,
      status: 'deleted',
    };
  }

  /**
   * POST /admin/dlq/bulk-retry
   * Retry multiple jobs at once
   */
  @Post('bulk-retry')
  @HttpCode(HttpStatus.OK)
  async bulkRetry(@Body() body: { jobIds: string[] }) {
    const result = await this.adminDLQService.bulkRetry(body.jobIds);

    return {
      message: 'Bulk retry operation completed',
      total: body.jobIds.length,
      succeeded: result.succeeded.length,
      failed: result.failed.length,
      details: result,
    };
  }

  /**
   * POST /admin/dlq/clean
   * Remove old jobs from DLQ
   */
  @Post('clean')
  @HttpCode(HttpStatus.OK)
  async cleanOldJobs(@Query('daysOld') daysOld?: string) {
    const days = daysOld ? parseInt(daysOld, 10) : 7;
    const removed = await this.adminDLQService.cleanOldJobs(days);

    return {
      message: 'Old jobs cleaned from DLQ',
      daysOld: days,
      removed,
    };
  }

  /**
   * Evaluate DLQ health based on statistics
   */
  private evaluateHealth(stats: any): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
  } {
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (stats.total === 0) {
      return { status: 'healthy', issues: [] };
    }

    // Check for old jobs
    if (stats.oldJobs > 0) {
      issues.push(`${stats.oldJobs} jobs are older than 24 hours`);
      status = 'critical';
    }

    // Check for high DLQ size
    if (stats.total > 100) {
      issues.push(`DLQ size is ${stats.total} (> 100)`);
      if (status !== 'critical') status = 'warning';
    }

    // Check for recent spike
    if (stats.recentJobs > 50) {
      issues.push(`${stats.recentJobs} jobs failed in the last hour`);
      status = 'critical';
    }

    return { status, issues };
  }
}
