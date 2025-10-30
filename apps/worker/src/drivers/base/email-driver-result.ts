import { EmailProvider } from '@email-gateway/shared';
import type { MappedError } from '../../services/error-mapping.service';

export interface SendResult {
  success: boolean;
  messageId?: string;
  provider: EmailProvider;
  ipAddress?: string;
  error?: MappedError;
  rawResponse?: unknown;
}
import {
  EmailProvider,
  ProviderQuotaInfo,
  DomainVerificationResult,
} from '@email-gateway/shared';

import { MappedError } from '../../services/error-mapping.service';

export interface SendResult {
  success: boolean;
  messageId?: string;
  provider: EmailProvider;
  ipAddress?: string;
  envelopeFrom?: string;
  error?: MappedError;
  metadata?: Record<string, unknown>;
}

export type QuotaInfo = ProviderQuotaInfo;

export type DomainVerification = DomainVerificationResult;

