"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainWarmupUtil = exports.WARMUP_SCHEDULE = void 0;
exports.WARMUP_SCHEDULE = [
    50,
    100,
    200,
    500,
    1000,
    2000,
    5000,
    10000,
    20000,
    50000,
];
class DomainWarmupUtil {
    static getDaysSince(startDate) {
        const now = new Date();
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        const diffTime = now.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
    }
    static getDailyLimit(day) {
        if (day <= 0) {
            return 0;
        }
        if (day > exports.WARMUP_SCHEDULE.length) {
            return Infinity;
        }
        const limit = exports.WARMUP_SCHEDULE[day - 1];
        return limit !== undefined ? limit : 0;
    }
    static calculateProgress(startDate, sentToday) {
        const daysSinceStart = this.getDaysSince(startDate);
        const currentDay = daysSinceStart + 1;
        const totalDays = exports.WARMUP_SCHEDULE.length;
        const todayLimit = this.getDailyLimit(currentDay);
        const isComplete = currentDay > totalDays;
        const percentComplete = Math.min(100, Math.round((currentDay / totalDays) * 100));
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
    static canSendEmail(warmupEnabled, warmupStartDate, sentToday) {
        if (!warmupEnabled || !warmupStartDate) {
            return { allowed: true };
        }
        const daysSinceStart = this.getDaysSince(warmupStartDate);
        const currentDay = daysSinceStart + 1;
        const dailyLimit = this.getDailyLimit(currentDay);
        if (dailyLimit === Infinity) {
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
    static getStartOfToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    }
    static getStartOfTomorrow() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
    }
}
exports.DomainWarmupUtil = DomainWarmupUtil;
//# sourceMappingURL=domain-warmup.service.js.map