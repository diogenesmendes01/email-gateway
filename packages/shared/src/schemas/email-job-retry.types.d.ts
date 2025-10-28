export declare const EMAIL_JOB_RETRY_CONFIG: {
    readonly MAX_ATTEMPTS: 5;
    readonly BASE_DELAY_MS: 1000;
    readonly MAX_DELAY_MS: 60000;
    readonly JITTER_FACTOR: 0.25;
    readonly DLQ_TTL_MS: number;
    readonly DLQ_NAME: "email:send:dlq";
    readonly DLQ_MAX_SIZE: 10000;
};
export declare const EMAIL_JOB_FAIRNESS_CONFIG: {
    readonly ENABLE_ROUND_ROBIN: true;
    readonly MAX_JOBS_PER_TENANT_BATCH: 3;
    readonly ROUND_ROBIN_BASE_PRIORITY: 5;
    readonly PRIORITY_INCREMENT_PER_ROUND: 1;
    readonly MAX_ROUND_ROBIN_PRIORITY: 1;
};
export declare const REDIS_CONFIG: {
    readonly AOF_FSYNC_POLICY: "everysec";
    readonly AOF_ENABLED: true;
    readonly MAXMEMORY_POLICY: "noeviction";
    readonly MAXMEMORY_BYTES: number;
    readonly CONNECT_TIMEOUT_MS: 10000;
    readonly MAX_RETRIES: 3;
    readonly RETRY_DELAY_MS: 1000;
};
export declare function calculateBackoffDelay(attempt: number): number;
export declare function calculateRoundRobinPriority(roundsWithoutProcessing: number): number;
export declare const SMTP_ERROR_CODES: {
    readonly RETRYABLE: readonly ["421", "450", "451", "452", "Throttling", "ServiceUnavailable"];
    readonly PERMANENT: readonly ["500", "501", "502", "503", "504", "550", "551", "552", "553", "554", "MessageRejected", "MailFromDomainNotVerified"];
};
export declare function isRetryableError(errorCode: string | undefined): boolean;
