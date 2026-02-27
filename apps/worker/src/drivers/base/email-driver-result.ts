import {
  EmailProvider,
  ProviderQuotaInfo,
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

export interface DomainVerification {
  domain: string;
  isVerified: boolean;
  dkimVerified: boolean;
  spfVerified: boolean;
  dmarcVerified: boolean;
}
