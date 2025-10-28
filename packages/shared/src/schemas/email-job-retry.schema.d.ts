import { z } from 'zod';
export declare const emailJobRetryConfigSchema: z.ZodObject<{
    attempts: z.ZodDefault<z.ZodNumber>;
    backoff: z.ZodDefault<z.ZodObject<{
        type: z.ZodLiteral<"exponential">;
        delay: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "exponential";
        delay: number;
    }, {
        type: "exponential";
        delay?: number | undefined;
    }>>;
    removeOnComplete: z.ZodDefault<z.ZodUnion<[z.ZodBoolean, z.ZodNumber]>>;
    removeOnFail: z.ZodDefault<z.ZodUnion<[z.ZodBoolean, z.ZodNumber]>>;
}, "strict", z.ZodTypeAny, {
    attempts: number;
    removeOnComplete: number | boolean;
    removeOnFail: number | boolean;
    backoff: {
        type: "exponential";
        delay: number;
    };
}, {
    attempts?: number | undefined;
    removeOnComplete?: number | boolean | undefined;
    removeOnFail?: number | boolean | undefined;
    backoff?: {
        type: "exponential";
        delay?: number | undefined;
    } | undefined;
}>;
export declare const emailJobDLQEntrySchema: z.ZodObject<{
    jobId: z.ZodString;
    outboxId: z.ZodString;
    companyId: z.ZodString;
    originalData: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    failedAttempts: z.ZodNumber;
    lastFailureReason: z.ZodEffects<z.ZodString, string, string>;
    lastFailureCode: z.ZodOptional<z.ZodString>;
    lastFailureTimestamp: z.ZodString;
    enqueuedAt: z.ZodString;
    movedToDLQAt: z.ZodString;
    ttl: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    outboxId: string;
    jobId: string;
    companyId: string;
    enqueuedAt: string;
    ttl: number;
    originalData: Record<string, unknown>;
    failedAttempts: number;
    lastFailureReason: string;
    lastFailureTimestamp: string;
    movedToDLQAt: string;
    lastFailureCode?: string | undefined;
}, {
    outboxId: string;
    jobId: string;
    companyId: string;
    enqueuedAt: string;
    originalData: Record<string, unknown>;
    failedAttempts: number;
    lastFailureReason: string;
    lastFailureTimestamp: string;
    movedToDLQAt: string;
    ttl?: number | undefined;
    lastFailureCode?: string | undefined;
}>;
export declare const tenantFairnessMetricsSchema: z.ZodObject<{
    companyId: z.ZodString;
    lastProcessedAt: z.ZodOptional<z.ZodString>;
    roundsWithoutProcessing: z.ZodDefault<z.ZodNumber>;
    currentPriority: z.ZodDefault<z.ZodNumber>;
    totalProcessed: z.ZodDefault<z.ZodNumber>;
    consecutiveBatchCount: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    companyId: string;
    roundsWithoutProcessing: number;
    currentPriority: number;
    totalProcessed: number;
    consecutiveBatchCount: number;
    lastProcessedAt?: string | undefined;
}, {
    companyId: string;
    lastProcessedAt?: string | undefined;
    roundsWithoutProcessing?: number | undefined;
    currentPriority?: number | undefined;
    totalProcessed?: number | undefined;
    consecutiveBatchCount?: number | undefined;
}>;
export declare const jobRetryHistorySchema: z.ZodObject<{
    attempt: z.ZodNumber;
    failedAt: z.ZodString;
    errorCode: z.ZodOptional<z.ZodString>;
    errorReason: z.ZodString;
    delayUntilNextAttempt: z.ZodOptional<z.ZodNumber>;
    isRetryable: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    errorReason: string;
    failedAt: string;
    attempt: number;
    isRetryable: boolean;
    errorCode?: string | undefined;
    delayUntilNextAttempt?: number | undefined;
}, {
    errorReason: string;
    failedAt: string;
    attempt: number;
    isRetryable: boolean;
    errorCode?: string | undefined;
    delayUntilNextAttempt?: number | undefined;
}>;
export declare function validateDLQEntry(data: unknown): {
    outboxId: string;
    jobId: string;
    companyId: string;
    enqueuedAt: string;
    ttl: number;
    originalData: Record<string, unknown>;
    failedAttempts: number;
    lastFailureReason: string;
    lastFailureTimestamp: string;
    movedToDLQAt: string;
    lastFailureCode?: string | undefined;
};
export type EmailJobRetryConfigInput = z.input<typeof emailJobRetryConfigSchema>;
export type EmailJobRetryConfig = z.output<typeof emailJobRetryConfigSchema>;
export type EmailJobDLQEntryInput = z.input<typeof emailJobDLQEntrySchema>;
export type EmailJobDLQEntry = z.output<typeof emailJobDLQEntrySchema>;
export type TenantFairnessMetricsInput = z.input<typeof tenantFairnessMetricsSchema>;
export type TenantFairnessMetrics = z.output<typeof tenantFairnessMetricsSchema>;
export type JobRetryHistoryInput = z.input<typeof jobRetryHistorySchema>;
export type JobRetryHistory = z.output<typeof jobRetryHistorySchema>;
