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
import { MetricsService } from '../../metrics/metrics.service';
import { BatchEmailDto, BatchStatusResponseDto, BatchCreateResponseDto } from '../dto/email-batch.dto';
import * as crypto from 'crypto';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

@Injectable()
export class BatchEmailService {
  private readonly logger = new Logger(BatchEmailService.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly metricsService: MetricsService
  ) {}

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

    // Validate all emails upfront if mode is all_or_nothing
    if (mode === 'all_or_nothing') {
      await this.validateAllEmailsUpfront(emails, companyId);
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

    // Record batch creation metrics
    this.metricsService.recordBatchCreated(companyId, emails.length);

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
    const startTime = Date.now();
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

    // Record batch completion metrics
    const durationSeconds = (Date.now() - startTime) / 1000;
    this.metricsService.recordBatchCompleted(
      companyId,
      status,
      durationSeconds,
      successCount,
      failedCount
    );

    this.logger.log({
      message: 'Batch processing completed',
      batchId,
      status,
      successCount,
      failedCount,
      totalEmails: emails.length,
      durationSeconds,
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
   * Validate all emails upfront (all_or_nothing mode)
   * Checks all emails before creating any records
   */
  private async validateAllEmailsUpfront(emails: any[], companyId: string): Promise<void> {
    const validationErrors: string[] = [];

    this.logger.log({
      message: 'Validating all emails upfront (all_or_nothing mode)',
      totalEmails: emails.length,
      companyId,
    });

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];

      // Required fields validation
      if (!email.to || typeof email.to !== 'string') {
        validationErrors.push(`Email ${i + 1}: Missing or invalid 'to' field`);
      } else {
        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.to)) {
          validationErrors.push(`Email ${i + 1}: Invalid email format in 'to' field (${email.to})`);
        }
      }

      if (!email.subject || typeof email.subject !== 'string' || email.subject.trim() === '') {
        validationErrors.push(`Email ${i + 1}: Missing or invalid 'subject' field`);
      }

      if (!email.html || typeof email.html !== 'string' || email.html.trim() === '') {
        validationErrors.push(`Email ${i + 1}: Missing or invalid 'html' field`);
      }

      // Optional fields validation
      if (email.cc && !Array.isArray(email.cc)) {
        validationErrors.push(`Email ${i + 1}: 'cc' must be an array`);
      } else if (email.cc) {
        email.cc.forEach((cc: string, idx: number) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(cc)) {
            validationErrors.push(`Email ${i + 1}: Invalid email format in cc[${idx}] (${cc})`);
          }
        });
      }

      if (email.bcc && !Array.isArray(email.bcc)) {
        validationErrors.push(`Email ${i + 1}: 'bcc' must be an array`);
      } else if (email.bcc) {
        email.bcc.forEach((bcc: string, idx: number) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(bcc)) {
            validationErrors.push(`Email ${i + 1}: Invalid email format in bcc[${idx}] (${bcc})`);
          }
        });
      }

      if (email.replyTo) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.replyTo)) {
          validationErrors.push(`Email ${i + 1}: Invalid email format in 'replyTo' (${email.replyTo})`);
        }
      }

      if (email.tags && !Array.isArray(email.tags)) {
        validationErrors.push(`Email ${i + 1}: 'tags' must be an array`);
      }

      // Limit checks
      if (email.subject && email.subject.length > 150) {
        validationErrors.push(`Email ${i + 1}: 'subject' exceeds 150 characters`);
      }

      if (email.html && email.html.length > 1000000) {
        // 1MB
        validationErrors.push(`Email ${i + 1}: 'html' exceeds 1MB`);
      }

      if (email.cc && email.cc.length > 50) {
        validationErrors.push(`Email ${i + 1}: 'cc' exceeds 50 recipients`);
      }

      if (email.bcc && email.bcc.length > 50) {
        validationErrors.push(`Email ${i + 1}: 'bcc' exceeds 50 recipients`);
      }

      // Stop collecting errors after 20 to avoid overwhelming response
      if (validationErrors.length >= 20) {
        validationErrors.push('... and more validation errors (showing first 20)');
        break;
      }
    }

    if (validationErrors.length > 0) {
      this.logger.warn({
        message: 'Batch validation failed (all_or_nothing mode)',
        totalEmails: emails.length,
        errorCount: validationErrors.length,
        companyId,
      });

      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `Batch validation failed in all_or_nothing mode. ${validationErrors.length} error(s) found.`,
        errors: validationErrors,
      });
    }

    this.logger.log({
      message: 'All emails validated successfully',
      totalEmails: emails.length,
      companyId,
    });
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

  /**
   * Process CSV file for batch email upload
   * Expected CSV format: to,subject,html,recipient_name,recipient_cpf
   */
  async processCsvFile(
    companyId: string,
    file: Express.Multer.File,
    requestId?: string
  ): Promise<BatchCreateResponseDto> {
    this.logger.log({
      message: 'Processing CSV file for batch upload',
      companyId,
      filename: file.originalname,
      size: file.size,
      requestId,
    });

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `CSV file size exceeds maximum of 10MB (got ${Math.round(file.size / 1024 / 1024)}MB)`,
      });
    }

    const emails: any[] = [];

    // Parse CSV
    const stream = Readable.from(file.buffer.toString());

    return new Promise<BatchCreateResponseDto>((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (row: any) => {
          // Expected CSV format:
          // to,subject,html,recipient_name,recipient_cpf,recipient_razao_social

          // Validate required fields
          if (!row.to || !row.subject || !row.html) {
            this.logger.warn({
              message: 'Skipping invalid CSV row',
              row,
              reason: 'Missing required fields (to, subject, html)',
            });
            return;
          }

          const email: any = {
            to: row.to.trim(),
            subject: row.subject.trim(),
            html: row.html,
          };

          // Optional fields
          if (row.cc) {
            email.cc = row.cc.split(';').map((e: string) => e.trim());
          }

          if (row.bcc) {
            email.bcc = row.bcc.split(';').map((e: string) => e.trim());
          }

          if (row.reply_to) {
            email.replyTo = row.reply_to.trim();
          }

          if (row.tags) {
            email.tags = row.tags.split(';').map((t: string) => t.trim());
          }

          if (row.external_id) {
            email.externalId = row.external_id.trim();
          }

          // Recipient data
          if (row.recipient_name || row.recipient_cpf || row.recipient_razao_social) {
            email.recipient = {
              email: row.to.trim(),
            };

            if (row.recipient_name) {
              email.recipient.nome = row.recipient_name.trim();
            }

            if (row.recipient_cpf) {
              email.recipient.cpfCnpj = row.recipient_cpf.trim();
            }

            if (row.recipient_razao_social) {
              email.recipient.razaoSocial = row.recipient_razao_social.trim();
            }

            if (row.recipient_external_id) {
              email.recipient.externalId = row.recipient_external_id.trim();
            }
          }

          emails.push(email);

          // Stop if we reach the limit
          if (emails.length >= 1000) {
            stream.destroy();
            reject(
              new BadRequestException({
                code: 'CSV_TOO_LARGE',
                message: 'CSV contains more than 1000 emails. Please split into multiple files.',
              })
            );
          }
        })
        .on('end', async () => {
          try {
            if (emails.length === 0) {
              reject(
                new BadRequestException({
                  code: 'EMPTY_CSV',
                  message: 'CSV file contains no valid email records',
                })
              );
              return;
            }

            this.logger.log({
              message: 'CSV parsed successfully',
              companyId,
              totalEmails: emails.length,
              requestId,
            });

            // Create batch with parsed emails
            const batch = await this.createBatch(
              companyId,
              {
                emails,
                mode: 'best_effort', // Use best_effort for CSV uploads
              },
              requestId
            );

            resolve(batch);
          } catch (error) {
            this.logger.error({
              message: 'Failed to create batch from CSV',
              error: error instanceof Error ? error.message : 'Unknown error',
              companyId,
              requestId,
            });
            reject(error);
          }
        })
        .on('error', (error: Error) => {
          this.logger.error({
            message: 'CSV parsing error',
            error: error.message,
            companyId,
            requestId,
          });
          reject(
            new BadRequestException({
              code: 'CSV_PARSE_ERROR',
              message: `Failed to parse CSV file: ${error.message}`,
            })
          );
        });
    });
  }
}
