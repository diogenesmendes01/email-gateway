/**
 * @email-gateway/worker - AWS SES Service
 *
 * Service responsável pela integração com AWS SES
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 * Integração com AWS SES para envio de emails
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  EmailSendJobData,
  PIPELINE_CONSTANTS,
  ErrorCode,
  ErrorCategory,
} from '@email-gateway/shared';
import { ErrorMappingService, type MappedError } from './error-mapping.service';
import CircuitBreaker from 'opossum';
import { prisma } from '@email-gateway/database'; // TASK-027

/**
 * Configuração do SES
 */
export interface SESConfig {
  region: string;
  fromAddress: string;
  replyToAddress?: string;
  configurationSetName?: string;
}

/**
 * Resultado do envio via SES
 */
export interface SESSendResult {
  success: boolean;
  messageId?: string;
  error?: MappedError;
}

/**
 * Service de integração com AWS SES
 */
export class SESService {
  private client: SESClient;
  private config: SESConfig;
  private circuitBreaker!: CircuitBreaker<
    [EmailSendJobData, string],
    SESSendResult
  >;

  constructor(config: SESConfig) {
    this.config = config;
    this.client = new SESClient({
      region: config.region,
    });

    // TASK-009: Initialize circuit breaker
    this.initializeCircuitBreaker();
  }

  private initializeCircuitBreaker() {
    this.circuitBreaker = new CircuitBreaker(
      this.sendEmailInternal.bind(this),
      {
        timeout: 35000, // 35s timeout (longer than SES SDK default)
        errorThresholdPercentage: 70, // Open after 70% errors
        resetTimeout: 60000, // Try to close after 60s
        rollingCountTimeout: 10000, // 10s window
        rollingCountBuckets: 10, // 10 buckets of 1s each
        volumeThreshold: 10, // Minimum 10 calls to evaluate
      }
    );

    // Circuit breaker events
    this.circuitBreaker.on('open', () => {
      console.error('[SES Circuit Breaker] OPEN - SES unavailable', {
        state: 'OPEN',
        timestamp: new Date().toISOString(),
        stats: this.circuitBreaker.stats,
      });
    });

    this.circuitBreaker.on('halfOpen', () => {
      console.warn('[SES Circuit Breaker] HALF-OPEN - Testing SES recovery', {
        state: 'HALF_OPEN',
        timestamp: new Date().toISOString(),
      });
    });

    this.circuitBreaker.on('close', () => {
      console.log('[SES Circuit Breaker] CLOSED - SES recovered', {
        state: 'CLOSED',
        timestamp: new Date().toISOString(),
        stats: this.circuitBreaker.stats,
      });
    });

    // Fallback when circuit is open
    this.circuitBreaker.fallback(() => ({
      success: false,
      error: {
        code: ErrorCode.SES_CIRCUIT_OPEN,
        category: ErrorCategory.TRANSIENT_ERROR,
        retryable: true,
        message: 'SES temporarily unavailable (circuit breaker open)',
        originalCode: 'CIRCUIT_BREAKER_OPEN',
      } as MappedError,
    }));
  }

  /**
   * Envia email via AWS SES com circuit breaker
   * TASK-009: Wrapped with circuit breaker for resilience
   *
   * @param jobData - Dados do job
   * @param htmlContent - Conteúdo HTML do email
   * @returns Resultado do envio
   */
  async sendEmail(
    jobData: EmailSendJobData,
    htmlContent: string,
  ): Promise<SESSendResult> {
    return this.circuitBreaker.fire(jobData, htmlContent);
  }

  /**
   * Internal method to send email via AWS SES
   * TASK-009: Wrapped by circuit breaker
   * TASK-027: Use company's verified domain
   *
   * @param jobData - Dados do job
   * @param htmlContent - Conteúdo HTML do email
   * @returns Resultado do envio
   */
  private async sendEmailInternal(
    jobData: EmailSendJobData,
    htmlContent: string,
  ): Promise<SESSendResult> {
    try {
      // Chaos flag: SIMULAR SES 429/THROTTLING
      if (process.env.CHAOS_SES_429 === 'true') {
        throw new Error('Throttling: Simulated SES 429');
      }

      // TASK-027: Buscar Company com domínio verificado
      const company = await prisma.company.findUnique({
        where: { id: jobData.companyId },
        select: {
          id: true,
          name: true,
          defaultFromAddress: true,
          defaultFromName: true,
          domainId: true,
          isSuspended: true,
          defaultDomain: {
            select: {
              id: true,
              domain: true,
              status: true,
            },
          },
        },
      });

      if (!company) {
        throw new Error(`Company ${jobData.companyId} not found`);
      }

      // TASK-027: Verificar se empresa está suspensa
      if (company.isSuspended) {
        throw new Error(`Company ${company.id} is suspended. Cannot send emails.`);
      }

      // TASK-027: Determinar fromAddress e fromName
      let fromAddress = this.config.fromAddress; // Fallback global
      let fromName: string | undefined;

      if (company.defaultFromAddress && company.defaultDomain) {
        // Validar se domínio está verificado
        if (company.defaultDomain.status === 'VERIFIED') {
          fromAddress = company.defaultFromAddress;
          fromName = company.defaultFromName || undefined;

          console.log({
            message: 'Using company verified domain',
            companyId: company.id,
            domain: company.defaultDomain.domain,
            fromAddress,
          });
        } else {
          console.warn({
            message: 'Company domain not verified, using global address',
            companyId: company.id,
            domainStatus: company.defaultDomain.status,
            fallbackAddress: fromAddress,
          });
        }
      } else {
        console.log({
          message: 'Company has no default domain, using global address',
          companyId: company.id,
          fallbackAddress: fromAddress,
        });
      }

      // TASK-027: Formatar Source com nome (RFC 5322)
      // Formato: "Display Name <email@domain.com>"
      const source = fromName
        ? `${fromName} <${fromAddress}>`
        : fromAddress;

      // Prepara os parâmetros do comando
      const command = new SendEmailCommand({
        Source: source, // TASK-027: era this.config.fromAddress
        Destination: {
          ToAddresses: [jobData.to],
          CcAddresses: jobData.cc || [],
          BccAddresses: jobData.bcc || [],
        },
        Message: {
          Subject: {
            Data: jobData.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlContent,
              Charset: 'UTF-8',
            },
          },
        },
        ReplyToAddresses: jobData.replyTo
          ? [jobData.replyTo]
          : this.config.replyToAddress
            ? [this.config.replyToAddress]
            : undefined,
        ConfigurationSetName: this.config.configurationSetName,
        Tags: this.buildTags(jobData),
      });

      // Envia email (circuit breaker handles timeout)
      const response = await this.client.send(command);

      // Verifica resposta
      if (!response || !('MessageId' in response)) {
        throw new Error('SES request failed - no MessageId returned');
      }

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      // Mapeia o erro para nossa taxonomia
      const mappedError = ErrorMappingService.mapSESError(error);

      // TASK-009: Throw retryable errors so circuit breaker can detect failures
      // Non-retryable errors are returned as failed results
      if (mappedError.retryable) {
        const enrichedError = new Error(
          `${mappedError.code}: ${mappedError.message}`,
        );
        // Attach mapped error for debugging
        (enrichedError as any).mappedError = mappedError;
        throw enrichedError;
      }

      // Non-retryable errors don't count toward circuit breaker
      return {
        success: false,
        error: mappedError,
      };
    }
  }

  /**
   * Constrói tags para o SES baseadas no job data
   *
   * @param jobData - Dados do job
   * @returns Array de tags SES
   */
  private buildTags(jobData: EmailSendJobData) {
    const tags: Array<{ Name: string; Value: string }> = [
      {
        Name: 'companyId',
        Value: jobData.companyId,
      },
      {
        Name: 'outboxId',
        Value: jobData.outboxId,
      },
      {
        Name: 'requestId',
        Value: jobData.requestId,
      },
    ];

    // Adiciona tags customizadas (limitado a 50 tags totais no SES)
    if (jobData.tags && jobData.tags.length > 0) {
      // Limita para não exceder o máximo de tags do SES
      const customTagsLimit = Math.min(jobData.tags.length, 47); // 50 - 3 tags fixas

      for (let i = 0; i < customTagsLimit; i++) {
        tags.push({
          Name: `custom_${i}`,
          Value: jobData.tags[i],
        });
      }
    }

    return tags;
  }

  /**
   * Get circuit breaker stats for monitoring
   * TASK-009: Expose circuit breaker state and statistics
   */
  getCircuitBreakerStats() {
    return {
      state: this.circuitBreaker.opened
        ? 'OPEN'
        : this.circuitBreaker.halfOpen
          ? 'HALF_OPEN'
          : 'CLOSED',
      stats: this.circuitBreaker.stats,
    };
  }

  /**
   * Valida a configuração do SES
   *
   * Faz um teste de "verificação" para garantir que as credenciais
   * e configuração estão corretas
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Tenta obter informações da conta SES
      // Isso não envia email, apenas valida as credenciais
      const { GetAccountSendingEnabledCommand } = await import(
        '@aws-sdk/client-ses'
      );

      const command = new GetAccountSendingEnabledCommand({});
      await this.client.send(command);

      return true;
    } catch (error) {
      console.error('SES configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Obtém estatísticas de envio da conta SES
   *
   * Útil para monitoramento de quota
   */
  async getSendQuota(): Promise<{
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  } | null> {
    try {
      const { GetSendQuotaCommand } = await import('@aws-sdk/client-ses');

      const command = new GetSendQuotaCommand({});
      const response = await this.client.send(command);

      return {
        max24HourSend: response.Max24HourSend || 0,
        maxSendRate: response.MaxSendRate || 0,
        sentLast24Hours: response.SentLast24Hours || 0,
      };
    } catch (error) {
      console.error('Failed to get SES send quota:', error);
      return null;
    }
  }
}
