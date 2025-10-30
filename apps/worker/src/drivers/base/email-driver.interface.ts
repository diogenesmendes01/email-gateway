import { EmailSendJobData } from '@email-gateway/shared';

import { DriverConfig, DriverSendOptions } from './driver-config.types';
import { DomainVerification, QuotaInfo, SendResult } from './email-driver-result';

export interface IEmailDriver {
  sendEmail(
    job: EmailSendJobData,
    config: DriverConfig,
    options: DriverSendOptions,
  ): Promise<SendResult>;

  validateConfig?(config: DriverConfig): Promise<boolean>;

  getQuota?(): Promise<QuotaInfo | null>;

  verifyDomain?(domain: string, config: DriverConfig): Promise<DomainVerification>;

  getIPPools?(): Promise<Array<{ id: string; name: string }> | null>;

  selectIPPool?(job: EmailSendJobData): Promise<string | null>;
}

export type EmailDriverConstructor<TConfig extends DriverConfig = DriverConfig> = new (
  config: TConfig,
) => IEmailDriver;
