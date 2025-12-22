import { EmailProvider } from '@email-gateway/shared';

import { PostalSMTPDriver } from './postal/postal-smtp-driver';
import type { DriverConfig } from './base/driver-config.types';
import type { IEmailDriver } from './base/email-driver.interface';

export class DriverFactory {
  static create(config: DriverConfig): IEmailDriver {
    switch (config.provider) {
      case EmailProvider.POSTAL_SMTP:
        return new PostalSMTPDriver(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}

