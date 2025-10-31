import { EmailSendJobData } from '@email-gateway/shared';
import { IPPoolType } from '@prisma/client';

import { DriverFactory } from '../drivers/driver-factory';
import type { DriverConfig, DriverSendOptions } from '../drivers/base/driver-config.types';
import type { IEmailDriver } from '../drivers/base/email-driver.interface';
import type { SendResult } from '../drivers/base/email-driver-result';
import { ErrorMappingService, type MappedError } from './error-mapping.service';
import { IPPoolSelectorService } from './ip-pool-selector.service';
import { MXRateLimiterService } from './mx-rate-limiter.service';

export interface EmailDriverDescriptor {
  id: string;
  config: DriverConfig;
  priority?: number;
  isActive?: boolean;
}

export class EmailDriverService {
  private readonly drivers: Array<{
    descriptor: EmailDriverDescriptor;
    driver: IEmailDriver;
  }>;
  private readonly mxRateLimiter?: MXRateLimiterService;

  constructor(descriptors: EmailDriverDescriptor[], dependencies?: { mxRateLimiter?: MXRateLimiterService }) {
    if (!descriptors.length) {
      throw new Error('[EmailDriverService] At least one driver configuration is required');
    }

    this.drivers = descriptors
      .map((descriptor) => ({
        descriptor: {
          priority: 0,
          isActive: true,
          ...descriptor,
        },
        driver: DriverFactory.create(descriptor.config),
      }))
      .sort((a, b) => (a.descriptor.priority ?? 0) - (b.descriptor.priority ?? 0));

    this.mxRateLimiter = dependencies?.mxRateLimiter;
  }

  async sendEmail(job: EmailSendJobData, htmlContent: string): Promise<SendResult> {
    if (this.mxRateLimiter) {
      const rateLimitResult = await this.mxRateLimiter.checkLimit(job.to);

      if (!rateLimitResult.allowed) {
        const error = ErrorMappingService.mapRateLimitExceeded(
          rateLimitResult.domain ?? 'unknown-domain',
          rateLimitResult.retryAfterMs ?? 1000,
        );

        return {
          success: false,
          provider: this.drivers[0].descriptor.config.provider,
          error,
        };
      }
    }

    let lastError: MappedError | undefined;

    for (const { descriptor, driver } of this.drivers) {
      if (descriptor.isActive === false) {
        continue;
      }

      try {
        const fallbackType = this.resolveIpPoolType(descriptor.config.extras);
        const selectedIpPool = await IPPoolSelectorService.selectPool({
          companyId: job.companyId,
          requestedPoolId: descriptor.config.ipPoolId as string | undefined,
          fallbackType,
        }).catch(() => null);

        const options: DriverSendOptions = {
          htmlContent,
          headers: job.headers ?? undefined,
          selectedIpPool,
          ipPoolId: (selectedIpPool?.id ?? descriptor.config.ipPoolId) as string | undefined,
        };

        const result = await driver.sendEmail(job, descriptor.config, options);

        if (result.success) {
          return result;
        }

        if (result.error) {
          lastError = result.error;

          if (result.error.retryable) {
            throw this.wrapRetryableError(result.error);
          }

          // Non retryable: tenta próximo driver
          continue;
        }

        continue;
      } catch (error) {
        const mappedError = this.extractMappedError(error);
        lastError = mappedError;

        if (mappedError.retryable) {
          throw this.wrapRetryableError(mappedError);
        }
      }
    }

    if (lastError) {
      return {
        success: false,
        provider: this.drivers[0].descriptor.config.provider,
        error: lastError,
      };
    }

    return {
      success: false,
      provider: this.drivers[0].descriptor.config.provider,
      error: ErrorMappingService.mapGenericError(new Error('All email drivers failed without detailed error information.')),
    };
  }

  async validatePrimaryConfig(): Promise<boolean> {
    const { driver, descriptor } = this.drivers[0];
    return (await driver.validateConfig?.(descriptor.config)) ?? true;
  }

  async getPrimaryQuota() {
    const { driver } = this.drivers[0];
    return driver.getQuota ? driver.getQuota() : null;
  }

  private extractMappedError(error: unknown): MappedError {
    if (error && typeof error === 'object' && 'mappedError' in error) {
      const mapped = (error as { mappedError?: MappedError }).mappedError;
      if (mapped) {
        return mapped;
      }
    }

    return ErrorMappingService.mapGenericError(error);
  }

  private wrapRetryableError(error: MappedError): Error {
    const enrichedError = new Error(`${error.code}: ${error.message}`);
    (enrichedError as any).mappedError = error;
    return enrichedError;
  }

  private resolveIpPoolType(extras?: Record<string, unknown>): IPPoolType | undefined {
    const value = extras?.['ipPoolType'];

    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.toUpperCase();

    return (Object.values(IPPoolType) as string[]).includes(normalized)
      ? (normalized as IPPoolType)
      : undefined;
  }
}

