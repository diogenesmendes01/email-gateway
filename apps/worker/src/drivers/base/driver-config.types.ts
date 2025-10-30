import { EmailProvider } from '@email-gateway/shared';

export interface DriverAuthConfig {
  user: string;
  pass: string;
}

export interface DriverTlsConfig {
  rejectUnauthorized?: boolean;
  ca?: string | string[];
  cert?: string;
  key?: string;
}

export interface DriverConfig {
  provider: EmailProvider;
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: DriverAuthConfig;
  apiKey?: string;
  region?: string;
  fromAddress?: string;
  replyToAddress?: string;
  configurationSetName?: string;
  ipPoolId?: string;
  returnPathDomain?: string;
  tls?: DriverTlsConfig;
  [key: string]: unknown;
}

export interface DriverQuotaInfo {
  max24HourSend?: number;
  maxSendRate?: number;
  sentLast24Hours?: number;
}
import { EmailProvider } from '@email-gateway/shared';

export interface DriverAuthConfig {
  user: string;
  pass: string;
}

export interface DriverTlsConfig {
  rejectUnauthorized?: boolean;
  ca?: string | string[];
  cert?: string;
  key?: string;
}

export interface DriverConfig {
  provider: EmailProvider;
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: DriverAuthConfig;
  apiKey?: string;
  region?: string;
  ipPoolId?: string;
  fromAddress?: string;
  replyToAddress?: string;
  configurationSetName?: string;
  tls?: DriverTlsConfig;
  /** Espaço livre para configurações específicas de cada driver */
  extras?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DriverSendOptions {
  htmlContent: string;
  textContent?: string;
  headers?: Record<string, string>;
  trackingPixelUrl?: string;
  clickTrackingDomain?: string;
  ipPoolId?: string;
  returnPath?: string;
}

