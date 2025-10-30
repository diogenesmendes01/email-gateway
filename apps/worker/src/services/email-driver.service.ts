import { EmailSendJobData } from '@email-gateway/shared';

import { DriverFactory } from '../drivers/driver-factory';
import type { DriverConfig } from '../drivers/base/driver-config.types';
import type { DriverSendRequest, IEmailDriver } from '../drivers/base/email-driver.interface';
import type { SendResult } from '../drivers/base/email-driver-result';
import { ErrorMappingService, type MappedError } from './error-mapping.service';

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

  constructor(descriptors: EmailDriverDescriptor[]) {
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
  }

  async sendEmail(job: EmailSendJobData, htmlContent: string): Promise<SendResult> {
    const request: DriverSendRequest = { job, htmlContent };

    let lastError: MappedError | undefined;

    for (const { descriptor, driver } of this.drivers) {
      if (descriptor.isActive === false) {
        continue;
      }

      try {
        const result = await driver.sendEmail(request, descriptor.config);

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
}

