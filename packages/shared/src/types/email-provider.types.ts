/**
 * @email-gateway/shared - Email Provider Types
 *
 * Define enumerações e tipos utilitários compartilhados entre API, worker e dashboard
 * para representar provedores de email e configuração relacionada.
 */

export enum EmailProvider {
  AWS_SES = 'AWS_SES',
  POSTAL_SMTP = 'POSTAL_SMTP',
  POSTAL_API = 'POSTAL_API',
  MAILU_SMTP = 'MAILU_SMTP',
  HARAKA_API = 'HARAKA_API',
  CUSTOM_SMTP = 'CUSTOM_SMTP',
}

export interface EmailProviderConfig {
  provider: EmailProvider;
  isActive: boolean;
  priority: number;
  /**
   * Configuração genérica serializada (ex.: host, porta, credenciais, apiKey etc)
   */
  config: Record<string, unknown>;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
}

export interface ProviderQuotaInfo {
  max24HourSend?: number;
  maxSendRate?: number;
  sentLast24Hours?: number;
}

export interface EmailProviderDomainVerification {
  domain: string;
  verified: boolean;
  records?: Array<{
    type: string;
    name: string;
    expectedValue?: string;
    currentValue?: string;
    verified: boolean;
  }>;
  metadata?: Record<string, unknown>;
}

