/**
 * TASK-025: Batch Email Service
 *
 * Business logic for batch email operations:
 * - Create batches (up to 1000 emails)
 * - Process batches asynchronously
 * - Track batch status and progress
 * - Support all_or_nothing and best_effort modes
 */

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import { QueueService } from '../../queue/queue.service';
import { BatchEmailDto, BatchStatusResponseDto, BatchCreateResponseDto } from '../dto/email-batch.dto';
import * as crypto from 'crypto';

@Injectable()
export class BatchEmailService {
  private readonly logger = new Logger(BatchEmailService.name);

  constructor(private readonly queueService: QueueService) {}

  /**
   * Create email batch and process asynchronously
   */
  async createBatch(
    companyId: string,
    dto: BatchEmailDto,
    requestId?: string
  ): Promise<BatchCreateResponseDto> {
    const { emails, mode = 'best_effort' } = dto;

    this.logger.log({
      message: 'Creating email batch',
      companyId,
      totalEmails: emails.length,
      mode,
      requestId,
    });

    // Validate batch size
    if (emails.length === 0) {
      throw new BadRequestException('Batch cannot be empty');
    }

    if (emails.length > 1000) {
      throw new BadRequestException('Batch cannot exceed 1000 emails');
    }

    // Create batch record
    const batch = await prisma.emailBatch.create({
      data: {
        companyId,
        status: 'PROCESSING',
        totalEmails: emails.length,
        metadata: { mode, requestId },
      },
    });

    // Ensure requestId is always defined for processing
    const finalRequestId = requestId || crypto.randomUUID();

    // Process batch asynchronously (don't await)
    this.processBatchAsync(companyId, batch.id, emails, mode, finalRequestId).catch((error) => {
      this.logger.error({
        message: 'Batch processing failed',
        batchId: batch.id,
        error: error.message,
        requestId,
      });
    });

    return {
      batchId: batch.id,
      status: batch.status,
      totalEmails: batch.totalEmails,
      message: 'Batch accepted for processing',
    };
  }

  /**
   * Process batch asynchronously
   * Creates EmailOutbox records and enqueues jobs for each email
   */
  private async processBatchAsync(
    companyId: string,
    batchId: string,
    emails: any[],
    mode: 'all_or_nothing' | 'best_effort',
    requestId: string
  ): Promise<void> {
    let successCount = 0;
    let failedCount = 0;

    for (const email of emails) {
      try {
        // Create EmailOutbox record
        const outboxId = crypto.randomUUID();

        const outbox = await prisma.emailOutbox.create({
          data: {
            id: outboxId,
            companyId,
            batchId, // Link to batch
            to: email.to,
            cc: email.cc || [],
            bcc: email.bcc || [],
            subject: email.subject,
            html: email.html,
            replyTo: email.replyTo,
            headers: email.headers,
            tags: email.tags || [],
            status: 'PENDING',
            externalId: email.externalId,
            requestId,
          },
        });

        // Construct full job data for queue
        const jobData = {
          outboxId: outbox.id,
          companyId,
          requestId,
          to: email.to,
          cc: email.cc || [],
          bcc: email.bcc || [],
          subject: email.subject,
          htmlRef: outbox.id, // Reference to outbox for HTML content
          replyTo: email.replyTo,
          headers: email.headers,
          tags: email.tags || [],
          recipient: {
            email: email.recipient?.email || email.to,
            externalId: email.recipient?.externalId,
            razaoSocial: email.recipient?.razaoSocial,
            nome: email.recipient?.nome,
          },
          attempt: 1,
          enqueuedAt: new Date().toISOString(),
        } as any;

        // Enqueue job for processing
        await this.queueService.enqueueEmailJob(jobData);

        successCount++;
      } catch (error) {
        failedCount++;

        this.logger.error({
          message: 'Failed to create email in batch',
          batchId,
          email: email.to,
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId,
        });

        // In all_or_nothing mode, rollback on first error
        if (mode === 'all_or_nothing') {
          await this.rollbackBatch(batchId);
          throw new BadRequestException({
            message: 'Batch processing failed - rolled back',
            failedEmail: email.to,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update batch progress every 100 emails
      if ((successCount + failedCount) % 100 === 0) {
        await this.updateBatchProgress(batchId, successCount, failedCount);
      }
    }

    // Final batch update
    const status =
      failedCount === 0
        ? 'COMPLETED'
        : failedCount < emails.length
          ? 'PARTIAL'
          : 'FAILED';

    await prisma.emailBatch.update({
      where: { id: batchId },
      data: {
        status,
        processedCount: successCount + failedCount,
        successCount,
        failedCount,
        completedAt: new Date(),
      },
    });

    this.logger.log({
      message: 'Batch processing completed',
      batchId,
      status,
      successCount,
      failedCount,
      totalEmails: emails.length,
      requestId,
    });
  }

  /**
   * Update batch progress
   */
  private async updateBatchProgress(
    batchId: string,
    successCount: number,
    failedCount: number
  ): Promise<void> {
    await prisma.emailBatch.update({
      where: { id: batchId },
      data: {
        processedCount: successCount + failedCount,
        successCount,
        failedCount,
      },
    });
  }

  /**
   * Rollback batch (all_or_nothing mode)
   * Deletes all created emails and the batch record
   */
  private async rollbackBatch(batchId: string): Promise<void> {
    // Delete all emails in batch
    await prisma.emailOutbox.deleteMany({
      where: { batchId },
    });

    // Delete batch record
    await prisma.emailBatch.delete({
      where: { id: batchId },
    });

    this.logger.warn({
      message: 'Batch rolled back (all_or_nothing mode)',
      batchId,
    });
  }

  /**
   * Get batch status
   */
  async getBatchStatus(
    companyId: string,
    batchId: string
  ): Promise<BatchStatusResponseDto> {
    const batch = await prisma.emailBatch.findFirst({
      where: {
        id: batchId,
        companyId,
      },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'BATCH_NOT_FOUND',
        message: `Batch with ID ${batchId} not found`,
      });
    }

    const progress =
      batch.totalEmails > 0
        ? Math.round((batch.processedCount / batch.totalEmails) * 100)
        : 0;

    return {
      batchId: batch.id,
      status: batch.status,
      totalEmails: batch.totalEmails,
      processedCount: batch.processedCount,
      successCount: batch.successCount,
      failedCount: batch.failedCount,
      progress,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt || undefined,
    };
  }

  /**
   * Get emails in batch (with pagination)
   */
  async getBatchEmails(companyId: string, batchId: string, limit = 100) {
    // Verify batch exists and belongs to company
    await this.getBatchStatus(companyId, batchId);

    const emails = await prisma.emailOutbox.findMany({
      where: { batchId },
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        to: true,
        subject: true,
        status: true,
        createdAt: true,
        processedAt: true,
        lastError: true,
      },
    });

    return {
      batchId,
      count: emails.length,
      emails,
    };
  }
}
