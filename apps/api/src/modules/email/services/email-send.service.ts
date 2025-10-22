/**
 * Email Send Service
 *
 * Business logic for sending emails:
 * - Validate and process email send requests
 * - Handle idempotency
 * - Persist to outbox
 * - Enqueue jobs for processing
 *
 * @see docs/api/03-email-send-contract.md
 */

import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { QueueService } from '../../queue/queue.service';
import { prisma } from '@email-gateway/database';
import {
  EmailSendBody,
  EmailSendResponse,
  maskCpfCnpj,
  encryptCpfCnpj,
  decryptCpfCnpj,
  hashCpfCnpjSha256,
} from '@email-gateway/shared';
import { Prisma, EmailStatus } from '@prisma/client';
import * as crypto from 'crypto';

interface SendEmailParams {
  companyId: string;
  body: EmailSendBody;
  idempotencyKey?: string;
  requestId?: string;
}

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);
  constructor(private readonly queueService: QueueService) {}
  /**
   * Send email asynchronously
   */
  async sendEmail(params: SendEmailParams): Promise<EmailSendResponse> {
    const { companyId, body, idempotencyKey, requestId } = params;

    // Handle idempotency
    if (idempotencyKey) {
      const existing = await this.checkIdempotency(companyId, idempotencyKey, body);
      if (existing) {
        if (existing.isConflict) {
          throw { code: 'IDEMPOTENCY_CONFLICT' };
        }
        return existing.response;
      }
    }

    // Generate IDs
    const outboxId = crypto.randomUUID();
    const jobId = outboxId; // Same ID for outbox and job
    const receivedAt = new Date();

    // Process recipient if provided
    let recipientId: string | undefined;
    if (body.recipient) {
      recipientId = await this.processRecipient(companyId, body.recipient);
    }

    // Create outbox record
    const outbox = await this.createOutbox({
      id: outboxId,
      companyId,
      recipientId,
      externalId: body.externalId,
      to: body.to,
      cc: body.cc || [],
      bcc: body.bcc || [],
      subject: body.subject,
      html: body.html,
      replyTo: body.replyTo,
      headers: body.headers,
      tags: body.tags || [],
      requestId,
    });

    // Store idempotency key if provided
    if (idempotencyKey) {
      await this.storeIdempotencyKey({
        companyId,
        key: idempotencyKey,
        outboxId,
        requestHash: this.hashRequest(body),
      });
    }

    
    // Enfileira job no BullMQ
    try {
      const jobData = {
        outboxId,
        companyId,
        requestId: requestId || this.generateRequestId(),
        to: body.to,
        cc: body.cc || [],
        bcc: body.bcc || [],
        subject: body.subject,
        htmlRef: outboxId, // simples referência; pode ser ajustada para S3/DB
        replyTo: body.replyTo,
        headers: body.headers,
        tags: body.tags || [],
        recipient: {
          recipientId: recipientId,
          externalId: body.recipient?.externalId,
          cpfCnpjHash: body.recipient?.cpfCnpj ? this.hashCpfCnpj(body.recipient.cpfCnpj) : undefined,
          razaoSocial: body.recipient?.razaoSocial,
          nome: body.recipient?.nome,
          email: body.recipient?.email || body.to,
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      } as any;

      const enqueuedJobId = await this.queueService.enqueueEmailJob(jobData);

      // Atualiza outbox com jobId e status ENQUEUED
      await prisma.emailOutbox.update({
        where: { id: outboxId },
        data: {
          jobId: enqueuedJobId,
          status: EmailStatus.ENQUEUED,
          enqueuedAt: new Date(),
        },
      });

      console.log(`✅ Email enqueued: outboxId=${outboxId}, jobId=${enqueuedJobId}`);
    } catch (error) {
      // Rollback outbox em caso de falha ao enfileirar
      await prisma.emailOutbox.delete({ where: { id: outboxId } });
      throw new InternalServerErrorException({
        error: {
          code: 'QUEUE_UNAVAILABLE',
          message: 'Unable to enqueue email for processing',
          requestId,
        },
      });
    }

    // Create response
    const response: EmailSendResponse = {
      outboxId,
      jobId,
      requestId: requestId || this.generateRequestId(),
      status: EmailStatus.ENQUEUED,
      receivedAt: receivedAt.toISOString(),
      recipient: body.recipient?.externalId ? {
        externalId: body.recipient.externalId,
      } : undefined,
    };

    return response;
  }

  /**
   * Check idempotency and return existing response if found
   */
  private async checkIdempotency(
    companyId: string,
    idempotencyKey: string,
    body: EmailSendBody,
  ): Promise<{ response: EmailSendResponse; isConflict: boolean } | null> {
    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        companyId_key: {
          companyId,
          key: idempotencyKey,
        },
      },
      include: {
        company: true,
      },
    });

    if (!existing) {
      return null;
    }

    // Check if expired
    if (existing.expiresAt < new Date()) {
      await prisma.idempotencyKey.delete({
        where: { id: existing.id },
      });
      return null;
    }

    // Get the original outbox
    const outbox = await prisma.emailOutbox.findUnique({
      where: { id: existing.outboxId },
    });

    if (!outbox) {
      return null;
    }

    // Check if request is equivalent
    const currentHash = this.hashRequest(body);
    const isEquivalent = currentHash === existing.requestHash;

    if (isEquivalent) {
      // Return existing response
      const response: EmailSendResponse = {
        outboxId: outbox.id,
        jobId: outbox.jobId || outbox.id,
        requestId: outbox.requestId || this.generateRequestId(),
        status: outbox.status as any,
        receivedAt: outbox.createdAt.toISOString(),
        recipient: outbox.recipientId ? {
          externalId: 'existing', // External ID from existing outbox
        } : undefined,
      };

      return { response, isConflict: false };
    } else {
      // Conflict: same key, different request
      return { response: {} as EmailSendResponse, isConflict: true };
    }
  }

  /**
   * Process recipient data (create or update)
   */
  private async processRecipient(
    companyId: string,
    recipient: EmailSendBody['recipient'],
  ): Promise<string | undefined> {
    if (!recipient) {
      return undefined;
    }

    const recipientData: Prisma.RecipientCreateInput = {
      company: { connect: { id: companyId } },
      email: recipient.email || '',
    };

    // Add optional fields
    if (recipient.externalId) {
      recipientData.externalId = recipient.externalId;
    }

    if (recipient.cpfCnpj) {
      const hash = hashCpfCnpjSha256(recipient.cpfCnpj);
      const { encrypted, salt } = encryptCpfCnpj(recipient.cpfCnpj, this.getEncryptionKey());
      recipientData.cpfCnpjHash = hash;
      recipientData.cpfCnpjEnc = encrypted;
      recipientData.cpfCnpjSalt = salt;
    }

    if (recipient.nome) {
      recipientData.nome = recipient.nome;
    }

    if (recipient.razaoSocial) {
      recipientData.razaoSocial = recipient.razaoSocial;
    }

    // Upsert recipient
    const upserted = await prisma.recipient.upsert({
      where: {
        companyId_externalId: {
          companyId,
          externalId: recipient.externalId || '',
        },
      },
      create: recipientData,
      update: recipientData,
    });

    return upserted.id;
  }

  /**
   * Create outbox record
   */
  private async createOutbox(data: {
    id: string;
    companyId: string;
    recipientId?: string;
    externalId?: string;
    to: string;
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    replyTo?: string;
    headers?: Record<string, string>;
    tags: string[];
    requestId?: string;
  }) {
    return prisma.emailOutbox.create({
      data: {
        id: data.id,
        companyId: data.companyId,
        recipientId: data.recipientId,
        externalId: data.externalId,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        html: data.html,
        replyTo: data.replyTo,
        headers: data.headers,
        tags: data.tags,
        requestId: data.requestId,
        status: EmailStatus.PENDING,
      },
    });
  }

  /**
   * Store idempotency key
   */
  private async storeIdempotencyKey(data: {
    companyId: string;
    key: string;
    outboxId: string;
    requestHash: string;
  }) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours TTL

    return prisma.idempotencyKey.create({
      data: {
        companyId: data.companyId,
        key: data.key,
        outboxId: data.outboxId,
        requestHash: data.requestHash,
        expiresAt,
      },
    });
  }

  /**
   * Hash request for idempotency comparison
   */
  private hashRequest(body: EmailSendBody): string {
    // Create a normalized version of the request for hashing
    const normalized = {
      to: body.to,
      cc: body.cc?.sort() || [],
      bcc: body.bcc?.sort() || [],
      subject: body.subject,
      html: body.html,
      replyTo: body.replyTo,
      headers: body.headers,
      tags: body.tags?.sort() || [],
      recipient: body.recipient,
      externalId: body.externalId,
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `req_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Get encryption key with validation
   */
  private getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length < 32) {
      throw new Error('ENCRYPTION_KEY must be set and at least 32 characters');
    }
    return key;
  }

  /**
   * Hash CPF/CNPJ using SHA-256
   */
  private hashCpfCnpj(cpfCnpj: string): string {
    return hashCpfCnpjSha256(cpfCnpj);
  }

  /**
   * Decrypt CPF/CNPJ for authorized access (using secure implementation)
   */
  public decryptCpfCnpj(encryptedCpfCnpj: string, salt: string, requestId?: string): string {
    try {
      return decryptCpfCnpj(encryptedCpfCnpj, this.getEncryptionKey(), salt);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStack = error instanceof Error ? error.stack : undefined;
          
          this.logger.error({
            message: 'Failed to decrypt CPF/CNPJ',
            requestId,
            error: errorMessage,
            stack: errorStack,
          });
      throw new InternalServerErrorException({
        code: 'DECRYPTION_FAILED',
        message: 'Unable to decrypt sensitive data',
      });
    }
  }
}
