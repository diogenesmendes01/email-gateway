/**
 * @email-gateway/worker - Logging Service
 *
 * Service responsável por gravação de logs e eventos no banco
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 * Gravação de email_logs e email_events com requestId/jobId/messageId
 */

import { PrismaClient, EmailStatus, EventType } from '@prisma/client';
import { EmailSendJobData, EmailPipelineState, maskObject } from '@email-gateway/shared';
import type { MappedError } from './error-mapping.service';

/**
 * Dados para criação de email_log
 */
export interface CreateEmailLogData {
  outboxId: string;
  companyId: string;
  recipientId?: string;
  to: string;
  subject: string;
  requestId: string;
  status: EmailStatus;
  sesMessageId?: string;
  errorCode?: string;
  errorReason?: string;
  attempts: number;
  durationMs?: number;
}

/**
 * Dados para criação de evento
 */
export interface CreateEventData {
  emailLogId: string;
  type: EventType;
  metadata?: Record<string, unknown>;
}

/**
 * Service de logging e eventos
 */
export class LoggingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Cria ou atualiza o registro de email_log
   *
   * @param data - Dados do log
   * @returns Email log criado/atualizado
   */
  async upsertEmailLog(data: CreateEmailLogData) {
    // Aplicar masking para proteger PII nos logs
    const maskedData = maskObject(data, { maskNames: false });
    
    const logData: any = {
      companyId: maskedData.companyId,
      recipientId: maskedData.recipientId,
      to: maskedData.to,
      subject: maskedData.subject,
      status: maskedData.status,
      attempts: maskedData.attempts,
      requestId: maskedData.requestId,
    };

    // Campos opcionais
    if (maskedData.sesMessageId) {
      logData.sesMessageId = maskedData.sesMessageId;
    }
    if (maskedData.errorCode) {
      logData.errorCode = maskedData.errorCode;
    }
    if (maskedData.errorReason) {
      logData.errorReason = maskedData.errorReason;
    }
    if (maskedData.durationMs !== undefined) {
      logData.durationMs = maskedData.durationMs;
    }

    // Define timestamps baseado no status
    if (maskedData.status === 'SENT') {
      logData.sentAt = new Date();
    } else if (maskedData.status === 'FAILED') {
      logData.failedAt = new Date();
    }

    return await this.prisma.emailLog.upsert({
      where: { outboxId: maskedData.outboxId },
      create: {
        ...logData,
        outboxId: maskedData.outboxId,
      },
      update: logData,
    });
  }

  /**
   * Cria um evento no email_events
   *
   * @param data - Dados do evento
   * @returns Evento criado
   */
  async createEvent(data: CreateEventData) {
    return await this.prisma.emailEvent.create({
      data: {
        emailLogId: data.emailLogId,
        type: data.type,
        metadata: data.metadata as any || {},
      },
    });
  }

  /**
   * Atualiza o status do email_outbox
   *
   * @param outboxId - ID do registro no outbox
   * @param status - Novo status
   * @param error - Erro (opcional)
   */
  async updateOutboxStatus(
    outboxId: string,
    status: EmailStatus,
    error?: {
      code: string;
      message: string;
    },
  ) {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'SENT') {
      updateData.processedAt = new Date();
    }

    if (error) {
      updateData.lastError = `[${error.code}] ${error.message}`;
    }

    return await this.prisma.emailOutbox.update({
      where: { id: outboxId },
      data: updateData,
    });
  }

  /**
   * Incrementa o contador de tentativas no outbox
   *
   * @param outboxId - ID do registro no outbox
   */
  async incrementAttempts(outboxId: string) {
    return await this.prisma.emailOutbox.update({
      where: { id: outboxId },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Grava transição de estado do pipeline
   *
   * @param jobData - Dados do job
   * @param state - Estado do pipeline
   * @param emailLogId - ID do email log (opcional)
   * @param metadata - Metadados adicionais
   */
  async logPipelineState(
    jobData: EmailSendJobData,
    state: EmailPipelineState,
    emailLogId?: string,
    metadata?: Record<string, unknown>,
  ) {
    const eventType = this.pipelineStateToEventType(state);

    // Se ainda não temos emailLogId, não podemos criar evento
    if (!emailLogId) {
      return null;
    }

    return await this.createEvent({
      emailLogId,
      type: eventType,
      metadata: {
        state,
        attempt: jobData.attempt,
        requestId: jobData.requestId,
        ...metadata,
      },
    });
  }

  /**
   * Grava log de sucesso no envio
   *
   * @param jobData - Dados do job
   * @param sesMessageId - Message ID do SES
   * @param durationMs - Duração do processamento
   */
  async logSuccess(
    jobData: EmailSendJobData,
    sesMessageId: string,
    durationMs: number,
  ) {
    // 1. Atualiza outbox
    await this.updateOutboxStatus(jobData.outboxId, 'SENT');

    // 2. Cria/atualiza email_log
    const emailLog = await this.upsertEmailLog({
      outboxId: jobData.outboxId,
      companyId: jobData.companyId,
      recipientId: jobData.recipient.recipientId,
      to: jobData.to,
      subject: jobData.subject,
      requestId: jobData.requestId,
      status: 'SENT',
      sesMessageId,
      attempts: jobData.attempt,
      durationMs,
    });

    // 3. Cria evento de SENT
    await this.createEvent({
      emailLogId: emailLog.id,
      type: 'SENT',
      metadata: {
        sesMessageId,
        durationMs,
        attempt: jobData.attempt,
      },
    });

    return emailLog;
  }

  /**
   * Grava log de falha no envio
   *
   * @param jobData - Dados do job
   * @param error - Erro mapeado
   * @param durationMs - Duração do processamento
   * @param willRetry - Se será retentado
   */
  async logFailure(
    jobData: EmailSendJobData,
    error: MappedError,
    durationMs: number,
    willRetry: boolean,
  ) {
    const status: EmailStatus = willRetry ? 'RETRYING' : 'FAILED';

    // 1. Atualiza outbox
    await this.updateOutboxStatus(jobData.outboxId, status, {
      code: error.code,
      message: error.message,
    });

    // 2. Cria/atualiza email_log
    const emailLog = await this.upsertEmailLog({
      outboxId: jobData.outboxId,
      companyId: jobData.companyId,
      recipientId: jobData.recipient.recipientId,
      to: jobData.to,
      subject: jobData.subject,
      requestId: jobData.requestId,
      status,
      errorCode: error.code,
      errorReason: (error as Error).message,
      attempts: jobData.attempt,
      durationMs,
    });

    // 3. Cria evento apropriado
    const eventType: EventType = willRetry ? 'RETRYING' : 'FAILED';
    await this.createEvent({
      emailLogId: emailLog.id,
      type: eventType,
      metadata: {
        errorCode: error.code,
        errorCategory: error.category,
        errorMessage: (error as Error).message,
        originalCode: error.originalCode,
        willRetry,
        attempt: jobData.attempt,
        durationMs,
      },
    });

    return emailLog;
  }

  /**
   * Mapeia estado do pipeline para EventType
   */
  private pipelineStateToEventType(state: EmailPipelineState): EventType {
    const mapping: Record<EmailPipelineState, EventType> = {
      [EmailPipelineState.RECEIVED]: 'PROCESSING',
      [EmailPipelineState.VALIDATED]: 'PROCESSING',
      [EmailPipelineState.SENT_ATTEMPT]: 'PROCESSING',
      [EmailPipelineState.SENT]: 'SENT',
      [EmailPipelineState.FAILED]: 'FAILED',
      [EmailPipelineState.RETRY_SCHEDULED]: 'RETRYING',
    };

    return mapping[state];
  }

  /**
   * Busca email_log por outboxId
   */
  async getEmailLogByOutboxId(outboxId: string) {
    return await this.prisma.emailLog.findUnique({
      where: { outboxId },
      include: {
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }
}
