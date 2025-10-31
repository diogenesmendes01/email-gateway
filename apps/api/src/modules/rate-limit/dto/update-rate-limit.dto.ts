import { RateLimitScope } from '@prisma/client';

export class UpdateRateLimitDto {
  scope?: RateLimitScope;
  target?: string;
  perMinute?: number | null;
  perHour?: number | null;
  perDay?: number | null;
}

