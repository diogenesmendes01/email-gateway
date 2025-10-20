/**
 * @email-gateway/worker - Email Send Processor
 *
 * Processador principal do job email:send com pipeline completo de estados
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 *
 * Pipeline de estados:
 * RECEIVED → VALIDATED → SENT_ATTEMPT → SENT (sucesso)
 *                                     → FAILED (erro permanente)
 *                                     → RETRY_SCHEDULED (erro transiente)
 *
 * Validações executadas:
 * 1. INTEGRITY - Validação da integridade do payload
 * 2. OUTBOX - Verificação do registro no outbox
 * 3. RECIPIENT - Validação do destinatário
 * 4. TEMPLATE - Validação do HTML/template
 *
 * Após validações bem-sucedidas:
 * - Envia email via AWS SES
 * - Grava logs e eventos com requestId/jobId/messageId
 * - Implementa ack/retry conforme Trilha 3.2
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@email-gateway/database';
import {
  EmailSendJobData,
  EmailPipelineState,
  PipelineContext,
  EMAIL_JOB_CONFIG,
} from '@email-gateway/shared';

import { ValidationService } from '../services/validation.service';
import { LoggingService } from '../services/logging.service';
import { SESService } from '../services/ses.service';
import { ErrorMappingService } from '../services/error-mapping.service';
import { MetricsService } from '../services/metrics.service';
import { TracingService, TraceContext } from '../services/tracing.service';

/**
 * Processador do job email:send
 *
 * Implementa o pipeline completo de estados e validações
 */
export class EmailSendProcessor {
  private validationService: ValidationService;
  private loggingService: LoggingService;
  private sesService: SESService;
  private metricsService: MetricsService;
  private tracingService: TracingService;

  constructor(
    private readonly prisma: PrismaClient,
    sesService: SESService,
    metricsService: MetricsService,
    tracingService: TracingService,
  ) {
    this.validationService = new ValidationService(prisma);
    this.loggingService = new LoggingService(prisma);
    this.sesService = sesService;
    this.metricsService = metricsService;
    this.tracingService = tracingService;
  }

  /**
   * Processa um job email:send
   *
   * Este é o método principal que executa todo o pipeline
   *
   * @param job - Job BullMQ
   * @returns Resultado do processamento
   */
  async process(job: Job<EmailSendJobData>) {
    const startTime = Date.now();
    const jobData = job.data;

    // Extract or create trace context
    let traceContext: TraceContext = this.tracingService.extractContextFromJob(jobData) ||
      this.tracingService.createTrace(jobData.companyId);

    // Record queue age metric (time from enqueue to processing start)
    const enqueuedAt = job.timestamp || startTime;
    await this.metricsService.recordQueueAge(enqueuedAt);

    // Record tenant job allocation
    await this.metricsService.recordTenantJob(jobData.companyId);

    // Log job start with trace context
    this.tracingService.logStart(traceContext, 'email-send-job', {
      jobId: job.id,
      outboxId: jobData.outboxId,
      attempt: jobData.attempt,
    });

    // Inicializa contexto do pipeline
    const context: PipelineContext = {
      jobId: job.id || jobData.outboxId,
      requestId: jobData.requestId,
      companyId: jobData.companyId,
      outboxId: jobData.outboxId,
      state: EmailPipelineState.RECEIVED,
      attempt: jobData.attempt,
      startedAt: new Date(),
      validations: [],
    };

    try {
      // ===================================================
      // ESTADO 1: RECEIVED
      // ===================================================
      await this.transitionToState(
        context,
        EmailPipelineState.RECEIVED,
        jobData,
      );

      // Incrementa contador de tentativas no outbox
      await this.loggingService.incrementAttempts(jobData.outboxId);

      // ===================================================
      // ESTADO 2: VALIDATED
      // ===================================================
      await this.validatePipeline(context, jobData);

      // ===================================================
      // ESTADO 3: SENT_ATTEMPT
      // ===================================================
      await this.transitionToState(
        context,
        EmailPipelineState.SENT_ATTEMPT,
        jobData,
      );

      // Busca o HTML do outbox
      const htmlContent = await this.getHtmlContent(jobData.outboxId);

      // Tenta enviar via SES
      const sendResult = await this.sesService.sendEmail(jobData, htmlContent);

      const durationMs = Date.now() - startTime;

      if (sendResult.success && sendResult.messageId) {
        // ===================================================
        // ESTADO 4a: SENT (Sucesso)
        // ===================================================
        await this.handleSuccess(
          context,
          jobData,
          sendResult.messageId,
          durationMs,
        );

        // Record success metrics
        await this.metricsService.recordSuccess(jobData.companyId);
        await this.metricsService.recordSendLatency(durationMs, jobData.companyId);

        // Log success with trace
        this.tracingService.logComplete(traceContext, 'email-send-job', startTime, {
          sesMessageId: sendResult.messageId,
          status: 'success',
        });

        return {
          success: true,
          sesMessageId: sendResult.messageId,
          durationMs,
        };
      } else {
        // ===================================================
        // ESTADO 4b: FAILED ou RETRY_SCHEDULED
        // ===================================================
        const result = await this.handleFailure(
          context,
          jobData,
          sendResult.error!,
          durationMs,
        );

        // Record error metrics
        await this.metricsService.recordError(jobData.companyId, sendResult.error!.code);

        // Log error with trace
        this.tracingService.logError(
          traceContext,
          'email-send-job',
          new Error(sendResult.error!.message),
          startTime,
          {
            errorCode: sendResult.error!.code,
            retryable: sendResult.error!.retryable,
          }
        );

        return result;
      }
    } catch (error) {
      // Erro inesperado no pipeline
      const durationMs = Date.now() - startTime;
      const mappedError = ErrorMappingService.mapGenericError(error);

      // Record error metrics
      await this.metricsService.recordError(jobData.companyId, mappedError.code);

      // Log error with trace
      this.tracingService.logError(
        traceContext,
        'email-send-job',
        error as Error,
        startTime,
        {
          errorCode: mappedError.code,
          errorCategory: mappedError.category,
        }
      );

      return await this.handleFailure(context, jobData, mappedError, durationMs);
    }
  }

  /**
   * Executa as validações do pipeline
   */
  private async validatePipeline(
    context: PipelineContext,
    jobData: EmailSendJobData,
  ) {
    // Executa todas as validações
    const validationResults =
      await this.validationService.validateAll(jobData);

    // Armazena resultados no contexto
    context.validations = validationResults;

    // Verifica se todas passaram
    if (!ValidationService.allValidationsPassed(validationResults)) {
      const firstFailure = ValidationService.getFirstFailure(validationResults);

      // Cria erro de validação
      const mappedError = ErrorMappingService.mapValidationError(
        firstFailure?.error || 'Validation failed',
      );

      // Adiciona ao contexto
      context.error = {
        code: firstFailure?.errorCode || mappedError.code,
        category: mappedError.category,
        message: firstFailure?.error || mappedError.message,
        retryable: false,
        metadata: firstFailure?.metadata,
      };

      // Loga evento de falha de validação
      const emailLog = await this.loggingService.getEmailLogByOutboxId(
        jobData.outboxId,
      );

      if (emailLog) {
        await this.loggingService.createEvent({
          emailLogId: emailLog.id,
          type: 'FAILED',
          metadata: {
            failedValidation: firstFailure?.type,
            errorCode: firstFailure?.errorCode,
            errorMessage: firstFailure?.error,
            allValidations: validationResults,
          },
        });
      }

      throw new Error(`Validation failed: ${firstFailure?.error}`);
    }

    // Validações passaram, transiciona para VALIDATED
    await this.transitionToState(
      context,
      EmailPipelineState.VALIDATED,
      jobData,
    );
  }

  /**
   * Transiciona o pipeline para um novo estado
   */
  private async transitionToState(
    context: PipelineContext,
    newState: EmailPipelineState,
    jobData: EmailSendJobData,
  ) {
    context.state = newState;

    // Busca ou cria email_log
    let emailLog = await this.loggingService.getEmailLogByOutboxId(
      jobData.outboxId,
    );

    if (!emailLog) {
      // Cria email_log inicial
      emailLog = await this.loggingService.upsertEmailLog({
        outboxId: jobData.outboxId,
        companyId: jobData.companyId,
        recipientId: jobData.recipient.recipientId,
        to: jobData.to,
        subject: jobData.subject,
        requestId: jobData.requestId,
        status: this.pipelineStateToEmailStatus(newState),
        attempts: jobData.attempt,
      }) as any;
    }

    // Registra transição de estado como evento
    if (emailLog) {
      await this.loggingService.logPipelineState(
        jobData,
        newState,
        emailLog.id,
        {
          timestamp: new Date().toISOString(),
        },
      );
    }
  }

  /**
   * Manipula sucesso no envio
   */
  private async handleSuccess(
    context: PipelineContext,
    jobData: EmailSendJobData,
    sesMessageId: string,
    durationMs: number,
  ) {
    context.state = EmailPipelineState.SENT;
    context.sesMessageId = sesMessageId;

    // Grava logs de sucesso
    await this.loggingService.logSuccess(jobData, sesMessageId, durationMs);

    console.log(
      `[EmailSendProcessor] SUCCESS: Email sent successfully. ` +
        `outboxId=${jobData.outboxId}, sesMessageId=${sesMessageId}, ` +
        `attempt=${jobData.attempt}, duration=${durationMs}ms`,
    );
  }

  /**
   * Manipula falha no envio
   */
  private async handleFailure(
    context: PipelineContext,
    jobData: EmailSendJobData,
    error: any,
    durationMs: number,
  ) {
    // Determina se deve retentar
    const shouldRetry =
      error.retryable && jobData.attempt < EMAIL_JOB_CONFIG.MAX_ATTEMPTS;

    const finalState = shouldRetry
      ? EmailPipelineState.RETRY_SCHEDULED
      : EmailPipelineState.FAILED;

    context.state = finalState;
    context.error = error;

    // Grava logs de falha
    await this.loggingService.logFailure(
      jobData,
      error,
      durationMs,
      shouldRetry,
    );

    console.error(
      `[EmailSendProcessor] ${shouldRetry ? 'RETRY' : 'FAILED'}: ` +
        `outboxId=${jobData.outboxId}, ` +
        `error=${error.code}, message="${error.message}", ` +
        `attempt=${jobData.attempt}/${EMAIL_JOB_CONFIG.MAX_ATTEMPTS}, ` +
        `duration=${durationMs}ms, willRetry=${shouldRetry}`,
    );

    // Se deve retentar, lança erro para BullMQ reprocessar
    if (shouldRetry) {
      throw new Error(
        `${error.code}: ${error.message} (attempt ${jobData.attempt}/${EMAIL_JOB_CONFIG.MAX_ATTEMPTS})`,
      );
    }

    // Erro permanente, retorna resultado de falha
    return {
      success: false,
      error: error.code,
      message: error.message,
      durationMs,
    };
  }

  /**
   * Busca conteúdo HTML do outbox
   */
  private async getHtmlContent(outboxId: string): Promise<string> {
    const outbox = await this.prisma.emailOutbox.findUnique({
      where: { id: outboxId },
      select: { html: true },
    });

    if (!outbox || !outbox.html) {
      throw new Error('HTML content not found in outbox');
    }

    return outbox.html;
  }

  /**
   * Mapeia estado do pipeline para EmailStatus do Prisma
   */
  private pipelineStateToEmailStatus(state: EmailPipelineState): any {
    const mapping: Record<EmailPipelineState, string> = {
      [EmailPipelineState.RECEIVED]: 'RECEIVED',
      [EmailPipelineState.VALIDATED]: 'VALIDATED',
      [EmailPipelineState.SENT_ATTEMPT]: 'SENT_ATTEMPT',
      [EmailPipelineState.SENT]: 'SENT',
      [EmailPipelineState.FAILED]: 'FAILED',
      [EmailPipelineState.RETRY_SCHEDULED]: 'RETRY_SCHEDULED',
    };

    return mapping[state];
  }
}
