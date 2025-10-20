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
} from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import {
  EmailSendBody,
  EmailSendResponse,
  maskCpfCnpj,
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

    // TODO: Enqueue job for processing
    // await this.queueService.enqueueEmailJob(jobId, outbox);

    // Create response
    const response: EmailSendResponse = {
      outboxId,
      jobId,
      requestId: requestId || this.generateRequestId(),
      status: EmailStatus.ENQUEUED,
      receivedAt,
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
        status: outbox.status,
        receivedAt: outbox.createdAt,
        recipient: outbox.recipientId ? {
          externalId: 'existing', // TODO: Get actual external ID
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
      const hash = this.hashCpfCnpj(recipient.cpfCnpj);
      recipientData.cpfCnpjHash = hash;
      recipientData.cpfCnpjEnc = recipient.cpfCnpj; // TODO: Encrypt this
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
   * Hash CPF/CNPJ for searching
   */
  private hashCpfCnpj(cpfCnpj: string): string {
    // Remove non-digits
    const digits = cpfCnpj.replace(/\D/g, '');
    return crypto.createHash('sha256').update(digits).digest('hex');
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `req_${crypto.randomBytes(16).toString('hex')}`;
  }
}
