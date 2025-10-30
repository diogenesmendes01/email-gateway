import { EmailProvider } from '@email-gateway/shared';

import type { DriverAuthConfig, DriverConfig } from '../base/driver-config.types';

export interface PostalSMTPConfig extends DriverConfig {
  provider: EmailProvider.POSTAL_SMTP;
  host: string;
  port: number;
  secure: boolean;
  auth: DriverAuthConfig;
  fromAddress: string;
  returnPathDomain?: string;
}

export function loadPostalConfig(): PostalSMTPConfig {
  const host = process.env.POSTAL_SMTP_HOST;
  const port = parseInt(process.env.POSTAL_SMTP_PORT || '587', 10);
  const user = process.env.POSTAL_SMTP_USER;
  const pass = process.env.POSTAL_SMTP_PASS;
  const secure = (process.env.POSTAL_SMTP_SECURE || 'false').toLowerCase() === 'true';
  const fromAddress = process.env.POSTAL_FROM_ADDRESS || process.env.SES_FROM_ADDRESS;
  const returnPathDomain = process.env.POSTAL_RETURN_PATH_DOMAIN;

  if (!host) {
    throw new Error('POSTAL_SMTP_HOST environment variable is required when using Postal SMTP');
  }

  if (!user || !pass) {
    throw new Error('POSTAL_SMTP_USER and POSTAL_SMTP_PASS environment variables are required when using Postal SMTP');
  }

  if (!fromAddress) {
    throw new Error('POSTAL_FROM_ADDRESS environment variable is required when using Postal SMTP');
  }

  return {
    provider: EmailProvider.POSTAL_SMTP,
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    fromAddress,
    returnPathDomain,
  };
}

export function validatePostalConfig(config: PostalSMTPConfig): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(config.fromAddress)) {
    throw new Error(`Invalid POSTAL_FROM_ADDRESS format: ${config.fromAddress}`);
  }

  if (config.returnPathDomain && !/^[a-z0-9.-]+$/i.test(config.returnPathDomain)) {
    throw new Error(`Invalid POSTAL_RETURN_PATH_DOMAIN: ${config.returnPathDomain}`);
  }
}

