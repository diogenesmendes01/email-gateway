import { EmailProvider } from '@email-gateway/shared';

export class UpdateProviderDto {
  provider?: EmailProvider;
  isActive?: boolean;
  priority?: number;
  config?: Record<string, unknown>;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
}

