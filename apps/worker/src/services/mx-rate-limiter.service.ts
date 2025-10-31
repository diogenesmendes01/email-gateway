import Redis from 'ioredis';

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMs?: number;
  domain?: string;
}

interface RateLimitConfig {
  perSecond: number;
  perMinute: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  'gmail.com': { perSecond: 20, perMinute: 1000 },
  'googlemail.com': { perSecond: 20, perMinute: 1000 },
  'outlook.com': { perSecond: 10, perMinute: 500 },
  'hotmail.com': { perSecond: 10, perMinute: 500 },
  'yahoo.com': { perSecond: 5, perMinute: 250 },
  default: { perSecond: 1, perMinute: 120 },
};

export class MXRateLimiterService {
  constructor(private readonly redis: Redis) {}

  async checkLimit(email: string): Promise<RateLimitCheckResult> {
    const domain = this.extractDomain(email);
    const limit = DEFAULT_LIMITS[domain] ?? DEFAULT_LIMITS.default;

    const now = Date.now();
    const secondWindow = Math.floor(now / 1000);
    const minuteWindow = Math.floor(now / 60000);

    const secondKey = this.buildKey(domain, 'sec', secondWindow);
    const minuteKey = this.buildKey(domain, 'min', minuteWindow);

    const pipeline = this.redis.multi();
    pipeline.incr(secondKey);
    pipeline.expire(secondKey, 2);
    pipeline.incr(minuteKey);
    pipeline.expire(minuteKey, 120);

    const execResult = await pipeline.exec();

    if (!execResult) {
      return { allowed: true, domain };
    }

    const secondCount = Number(execResult[0][1]);
    const minuteCount = Number(execResult[2][1]);

    if (secondCount > limit.perSecond) {
      return {
        allowed: false,
        retryAfterMs: 1000,
        domain,
      };
    }

    if (minuteCount > limit.perMinute) {
      const remaining = 60000 - (now % 60000);
      return {
        allowed: false,
        retryAfterMs: remaining,
        domain,
      };
    }

    return { allowed: true, domain };
  }

  private buildKey(domain: string, scope: string, window: number) {
    return `mx-rate:${domain}:${scope}:${window}`;
  }

  private extractDomain(email: string): string {
    const [, rawDomain = ''] = email.toLowerCase().split('@');

    if (rawDomain.includes('gmail')) {
      return 'gmail.com';
    }

    if (rawDomain.includes('googlemail')) {
      return 'googlemail.com';
    }

    if (rawDomain.includes('outlook') || rawDomain.includes('live.')) {
      return 'outlook.com';
    }

    if (rawDomain.includes('hotmail')) {
      return 'hotmail.com';
    }

    if (rawDomain.includes('yahoo')) {
      return 'yahoo.com';
    }

    return rawDomain || 'default';
  }
}

