import { EmailProvider } from '@email-gateway/shared';

import { SESDriver } from './aws-ses/ses-driver';
import { PostalSMTPDriver } from './postal/postal-smtp-driver';
import type { DriverConfig } from './base/driver-config.types';
import type { IEmailDriver } from './base/email-driver.interface';

export class DriverFactory {
  static create(config: DriverConfig): IEmailDriver {
    switch (config.provider) {
      case EmailProvider.AWS_SES:
        return new SESDriver(config);
      case EmailProvider.POSTAL_SMTP:
        return new PostalSMTPDriver(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}

