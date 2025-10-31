import { EmailProvider } from '@email-gateway/shared';

export class CreateProviderDto {
  provider!: EmailProvider;
  isActive?: boolean;
  priority?: number;
  config?: Record<string, unknown>;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
  companyId?: string | null;
}

