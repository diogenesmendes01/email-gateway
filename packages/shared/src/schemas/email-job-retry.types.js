"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SMTP_ERROR_CODES = exports.REDIS_CONFIG = exports.EMAIL_JOB_FAIRNESS_CONFIG = exports.EMAIL_JOB_RETRY_CONFIG = void 0;
exports.calculateBackoffDelay = calculateBackoffDelay;
exports.calculateRoundRobinPriority = calculateRoundRobinPriority;
exports.isRetryableError = isRetryableError;
const email_job_types_1 = require("./email-job.types");
exports.EMAIL_JOB_RETRY_CONFIG = {
    MAX_ATTEMPTS: email_job_types_1.EMAIL_JOB_CONFIG.MAX_ATTEMPTS,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 60000,
    JITTER_FACTOR: 0.25,
    DLQ_TTL_MS: email_job_types_1.EMAIL_JOB_CONFIG.DLQ_TTL,
    DLQ_NAME: 'email:send:dlq',
    DLQ_MAX_SIZE: 10000,
};
exports.EMAIL_JOB_FAIRNESS_CONFIG = {
    ENABLE_ROUND_ROBIN: true,
    MAX_JOBS_PER_TENANT_BATCH: 3,
    ROUND_ROBIN_BASE_PRIORITY: 5,
    PRIORITY_INCREMENT_PER_ROUND: 1,
    MAX_ROUND_ROBIN_PRIORITY: 1,
};
exports.REDIS_CONFIG = {
    AOF_FSYNC_POLICY: 'everysec',
    AOF_ENABLED: true,
    MAXMEMORY_POLICY: 'noeviction',
    MAXMEMORY_BYTES: 512 * 1024 * 1024,
    CONNECT_TIMEOUT_MS: 10000,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
};
function calculateBackoffDelay(attempt) {
    const { BASE_DELAY_MS, MAX_DELAY_MS, JITTER_FACTOR } = exports.EMAIL_JOB_RETRY_CONFIG;
    const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);
    const jitterRange = cappedDelay * JITTER_FACTOR;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, Math.round(cappedDelay + jitter));
}
function calculateRoundRobinPriority(roundsWithoutProcessing) {
    const { ROUND_ROBIN_BASE_PRIORITY, PRIORITY_INCREMENT_PER_ROUND, MAX_ROUND_ROBIN_PRIORITY, } = exports.EMAIL_JOB_FAIRNESS_CONFIG;
    const calculatedPriority = ROUND_ROBIN_BASE_PRIORITY -
        roundsWithoutProcessing * PRIORITY_INCREMENT_PER_ROUND;
    return Math.max(MAX_ROUND_ROBIN_PRIORITY, calculatedPriority);
}
exports.SMTP_ERROR_CODES = {
    RETRYABLE: [
        '421',
        '450',
        '451',
        '452',
        'Throttling',
        'ServiceUnavailable',
    ],
    PERMANENT: [
        '500',
        '501',
        '502',
        '503',
        '504',
        '550',
        '551',
        '552',
        '553',
        '554',
        'MessageRejected',
        'MailFromDomainNotVerified',
    ],
};
function isRetryableError(errorCode) {
    if (!errorCode)
        return false;
    return exports.SMTP_ERROR_CODES.RETRYABLE.some((code) => errorCode.includes(code));
}
//# sourceMappingURL=email-job-retry.types.js.map