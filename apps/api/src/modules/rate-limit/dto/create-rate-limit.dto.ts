import { RateLimitScope } from '@prisma/client';

export class CreateRateLimitDto {
  scope!: RateLimitScope;
  target!: string;
  perMinute?: number | null;
  perHour?: number | null;
  perDay?: number | null;
}

