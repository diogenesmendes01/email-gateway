/**
 * Domain Warm-up Service
 *
 * TASK-016: Implement gradual email volume increase for new domains
 *
 * AWS SES Best Practice: Gradually increase sending volume to build reputation
 * and avoid being flagged as spam or blocked by ISPs.
 *
 * @see task/TASK-016-DOMAIN-WARMUP-LOGIC.md
 * @see https://docs.aws.amazon.com/ses/latest/dg/warming-up.html
 */

/**
 * Warm-up schedule: emails per day
 *
 * Based on AWS SES best practices:
 * - Start small (50 emails/day)
 * - Double every 1-2 days
 * - Reach production volume in 10-14 days
 */
export const WARMUP_SCHEDULE = [
  50,     // Day 1
  100,    // Day 2
  200,    // Day 3
  500,    // Day 4
  1000,   // Day 5
  2000,   // Day 6
  5000,   // Day 7
  10000,  // Day 8
  20000,  // Day 9
  50000,  // Day 10
] as const;

export interface DomainWarmupConfig {
  enabled: boolean;
  startDate: Date;
  currentDay: number;
  dailyLimit: number;
  sentToday: number;
}

export interface DomainWarmupProgress {
  enabled: boolean;
  currentDay: number;
  totalDays: number;
  todayLimit: number;
  todaySent: number;
  todayRemaining: number;
  percentComplete: number;
  isComplete: boolean;
}

export interface DomainWarmupCanSendResult {
  allowed: boolean;
  reason?: string;
  warmupInfo?: DomainWarmupConfig;
}

/**
 * Domain Warm-up Utility Functions
 */
export class DomainWarmupUtil {
  /**
   * Calculate number of days since a date (midnight to midnight)
   */
  static getDaysSince(startDate: Date): number {
    const now = new Date();
    const start = new Date(startDate);

    // Reset to midnight for accurate day calculation
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const diffTime = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  /**
   * Get daily sending limit for a given warm-up day
   *
   * @param day - Current day of warm-up (1-indexed)
   * @returns Daily limit, or Infinity if warm-up complete
   */
  static getDailyLimit(day: number): number {
    if (day <= 0) {
      return 0;
    }

    if (day > WARMUP_SCHEDULE.length) {
      // Warm-up completed, no limit
      return Infinity;
    }

    const limit = WARMUP_SCHEDULE[day - 1];
    return limit !== undefined ? limit : 0;
  }

  /**
   * Calculate warm-up progress
   */
  static calculateProgress(
    startDate: Date,
    sentToday: number
  ): DomainWarmupProgress {
    const daysSinceStart = this.getDaysSince(startDate);
    const currentDay = daysSinceStart + 1; // 1-indexed
    const totalDays = WARMUP_SCHEDULE.length;
    const todayLimit = this.getDailyLimit(currentDay);
    const isComplete = currentDay > totalDays;

    const percentComplete = Math.min(
      100,
      Math.round((currentDay / totalDays) * 100)
    );

    const limitForDisplay = todayLimit === Infinity ? 0 : todayLimit;

    return {
      enabled: true,
      currentDay,
      totalDays,
      todayLimit: limitForDisplay,
      todaySent: sentToday,
      todayRemaining: Math.max(0, limitForDisplay - sentToday),
      percentComplete,
      isComplete,
    };
  }

  /**
   * Check if domain can send email based on warm-up limits
   */
  static canSendEmail(
    warmupEnabled: boolean,
    warmupStartDate: Date | null,
    sentToday: number
  ): DomainWarmupCanSendResult {
    if (!warmupEnabled || !warmupStartDate) {
      return { allowed: true };
    }

    const daysSinceStart = this.getDaysSince(warmupStartDate);
    const currentDay = daysSinceStart + 1;
    const dailyLimit = this.getDailyLimit(currentDay);

    if (dailyLimit === Infinity) {
      // Warm-up complete
      return { allowed: true };
    }

    if (sentToday >= dailyLimit) {
      return {
        allowed: false,
        reason: `Daily warm-up limit reached (${dailyLimit} emails/day). Try again tomorrow.`,
        warmupInfo: {
          enabled: true,
          startDate: warmupStartDate,
          currentDay,
          dailyLimit,
          sentToday,
        },
      };
    }

    return {
      allowed: true,
      warmupInfo: {
        enabled: true,
        startDate: warmupStartDate,
        currentDay,
        dailyLimit,
        sentToday,
      },
    };
  }

  /**
   * Get start of today (midnight)
   */
  static getStartOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  /**
   * Get start of tomorrow (midnight)
   */
  static getStartOfTomorrow(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
}
