import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import CircuitBreaker from 'opossum';
import { prisma } from '@email-gateway/database';
import {
  EmailProvider,
  EmailSendJobData,
  ErrorCategory,
  ErrorCode,
} from '@email-gateway/shared';

import type { DriverConfig } from '../base/driver-config.types';
import type {
  DriverSendRequest,
  IEmailDriver,
} from '../base/email-driver.interface';
import type { SendResult } from '../base/email-driver-result';
import { ErrorMappingService, type MappedError } from '../../services/error-mapping.service';

export interface SESDriverConfig extends DriverConfig {
  region: string;
  fromAddress: string;
  replyToAddress?: string;
  configurationSetName?: string;
}

export class SESDriver implements IEmailDriver {
  private client: SESClient;
  private readonly config: SESDriverConfig;
  private circuitBreaker!: CircuitBreaker<
    [DriverSendRequest],
    SendResult
  >;

  constructor(config: DriverConfig) {
    this.config = this.normalizeConfig(config);
    this.client = new SESClient({ region: this.config.region });
    this.initializeCircuitBreaker();
  }

  async sendEmail(request: DriverSendRequest, _config?: DriverConfig): Promise<SendResult> {
    return this.circuitBreaker.fire(request);
  }

  async validateConfig(config: DriverConfig = this.config): Promise<boolean> {
    try {
      const { GetAccountSendingEnabledCommand } = await import('@aws-sdk/client-ses');
      const command = new GetAccountSendingEnabledCommand({});
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error('[SESDriver] Configuration validation failed:', error);
      return false;
    }
  }

  async getQuota() {
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
      console.error('[SESDriver] Failed to get send quota:', error);
      return null;
    }
  }

  private initializeCircuitBreaker() {
    this.circuitBreaker = new CircuitBreaker(
      this.sendEmailInternal.bind(this),
      {
        timeout: 35000,
        errorThresholdPercentage: 70,
        resetTimeout: 60000,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 10,
        volumeThreshold: 10,
      },
    );

    this.circuitBreaker.on('open', () => {
      console.error('[SESDriver] Circuit breaker OPEN - SES unavailable', {
        state: 'OPEN',
        timestamp: new Date().toISOString(),
        stats: this.circuitBreaker.stats,
      });
    });

    this.circuitBreaker.on('halfOpen', () => {
      console.warn('[SESDriver] Circuit breaker HALF-OPEN - Testing SES recovery', {
        state: 'HALF_OPEN',
        timestamp: new Date().toISOString(),
      });
    });

    this.circuitBreaker.on('close', () => {
      console.log('[SESDriver] Circuit breaker CLOSED - SES recovered', {
        state: 'CLOSED',
        timestamp: new Date().toISOString(),
        stats: this.circuitBreaker.stats,
      });
    });

    this.circuitBreaker.fallback(() => ({
      success: false,
      provider: EmailProvider.AWS_SES,
      error: {
        code: ErrorCode.SES_CIRCUIT_OPEN,
        category: ErrorCategory.TRANSIENT_ERROR,
        retryable: true,
        message: 'SES temporarily unavailable (circuit breaker open)',
        originalCode: 'CIRCUIT_BREAKER_OPEN',
      } satisfies MappedError,
    }));
  }

  private async sendEmailInternal(request: DriverSendRequest): Promise<SendResult> {
    const { job, htmlContent } = request;

    try {
      if (process.env.CHAOS_SES_429 === 'true') {
        throw new Error('Throttling: Simulated SES 429');
      }

      const company = await prisma.company.findUnique({
        where: { id: job.companyId },
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
        throw new Error(`Company ${job.companyId} not found`);
      }

      if (company.isSuspended) {
        throw new Error(`Company ${company.id} is suspended. Cannot send emails.`);
      }

      let fromAddress = this.config.fromAddress;
      let fromName: string | undefined;

      if (company.defaultFromAddress && company.defaultDomain) {
        if (company.defaultDomain.status === 'VERIFIED') {
          fromAddress = company.defaultFromAddress;
          fromName = company.defaultFromName || undefined;
          console.log({
            message: '[SESDriver] Using company verified domain',
            companyId: company.id,
            domain: company.defaultDomain.domain,
            fromAddress,
          });
        } else {
          console.warn({
            message: '[SESDriver] Company domain not verified, using global address',
            companyId: company.id,
            domainStatus: company.defaultDomain.status,
            fallbackAddress: fromAddress,
          });
        }
      } else {
        console.log({
          message: '[SESDriver] Company has no default domain, using global address',
          companyId: company.id,
          fallbackAddress: fromAddress,
        });
      }

      const source = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

      const command = new SendEmailCommand({
        Source: source,
        Destination: {
          ToAddresses: [job.to],
          CcAddresses: job.cc || [],
          BccAddresses: job.bcc || [],
        },
        Message: {
          Subject: {
            Data: job.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlContent,
              Charset: 'UTF-8',
            },
          },
        },
        ReplyToAddresses: job.replyTo
          ? [job.replyTo]
          : this.config.replyToAddress
            ? [this.config.replyToAddress]
            : undefined,
        ConfigurationSetName: this.config.configurationSetName,
        Tags: this.buildTags(job),
      });

      const response = await this.client.send(command);

      if (!response || !('MessageId' in response)) {
        throw new Error('SES request failed - no MessageId returned');
      }

      return {
        success: true,
        messageId: response.MessageId,
        provider: EmailProvider.AWS_SES,
        rawResponse: response,
      };
    } catch (error) {
      const mappedError = ErrorMappingService.mapSESError(error);

      if (mappedError.retryable) {
        const enrichedError = new Error(`${mappedError.code}: ${mappedError.message}`);
        (enrichedError as any).mappedError = mappedError;
        throw enrichedError;
      }

      return {
        success: false,
        provider: EmailProvider.AWS_SES,
        error: mappedError,
      };
    }
  }

  private buildTags(jobData: EmailSendJobData) {
    const tags: Array<{ Name: string; Value: string }> = [
      { Name: 'companyId', Value: jobData.companyId },
      { Name: 'outboxId', Value: jobData.outboxId },
      { Name: 'requestId', Value: jobData.requestId },
    ];

    if (jobData.tags && jobData.tags.length > 0) {
      const customTagsLimit = Math.min(jobData.tags.length, 47);
      for (let i = 0; i < customTagsLimit; i++) {
        tags.push({ Name: `custom_${i}`, Value: jobData.tags[i] });
      }
    }

    return tags;
  }

  private normalizeConfig(config: DriverConfig): SESDriverConfig {
    if (!config.region) {
      throw new Error('SESDriver requires region in config');
    }

    if (!config.fromAddress) {
      throw new Error('SESDriver requires fromAddress in config');
    }

    return {
      ...config,
      provider: EmailProvider.AWS_SES,
    } as SESDriverConfig;
  }
}

