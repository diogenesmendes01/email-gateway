export declare const WARMUP_SCHEDULE: readonly [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
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
export declare class DomainWarmupUtil {
    static getDaysSince(startDate: Date): number;
    static getDailyLimit(day: number): number;
    static calculateProgress(startDate: Date, sentToday: number): DomainWarmupProgress;
    static canSendEmail(warmupEnabled: boolean, warmupStartDate: Date | null, sentToday: number): DomainWarmupCanSendResult;
    static getStartOfToday(): Date;
    static getStartOfTomorrow(): Date;
}
