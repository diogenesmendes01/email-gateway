/**
 * TASK-025: Batch Rate Limit Guard
 *
 * Rate limiting for batch operations to prevent abuse:
 * - Limit: 10 batches per hour per company
 * - Applies to POST /v1/email/batch and POST /v1/email/batch/csv
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { prisma } from '@email-gateway/database';

@Injectable()
export class BatchRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(BatchRateLimitGuard.name);
  private readonly BATCH_LIMIT_PER_HOUR = 10;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Get companyId from request (set by ApiKeyGuard)
    const companyId = request.user?.companyId || request.companyId;

    if (!companyId) {
      this.logger.error('Company ID not found in request. Ensure ApiKeyGuard is applied first.');
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          code: 'MISSING_COMPANY_ID',
          message: 'Authentication required',
        },
        HttpStatus.UNAUTHORIZED
      );
    }

    // Check batches created in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentBatchCount = await prisma.emailBatch.count({
      where: {
        companyId,
        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    this.logger.debug({
      message: 'Checking batch rate limit',
      companyId,
      recentBatches: recentBatchCount,
      limit: this.BATCH_LIMIT_PER_HOUR,
    });

    // Check if limit exceeded
    if (recentBatchCount >= this.BATCH_LIMIT_PER_HOUR) {
      this.logger.warn({
        message: 'Batch rate limit exceeded',
        companyId,
        recentBatches: recentBatchCount,
        limit: this.BATCH_LIMIT_PER_HOUR,
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'BATCH_RATE_LIMIT_EXCEEDED',
          message: `Batch rate limit exceeded. Maximum ${this.BATCH_LIMIT_PER_HOUR} batches per hour.`,
          limit: this.BATCH_LIMIT_PER_HOUR,
          current: recentBatchCount,
          retryAfter: 3600, // 1 hour in seconds
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }
}
