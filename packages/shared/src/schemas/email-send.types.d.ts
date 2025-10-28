export declare enum EmailStatus {
    PENDING = "PENDING",
    ENQUEUED = "ENQUEUED",
    PROCESSING = "PROCESSING",
    SENT = "SENT",
    FAILED = "FAILED",
    RETRYING = "RETRYING"
}
export declare enum EmailEventType {
    CREATED = "CREATED",
    ENQUEUED = "ENQUEUED",
    PROCESSING = "PROCESSING",
    SENT = "SENT",
    FAILED = "FAILED",
    RETRY = "RETRY",
    DLQ = "DLQ",
    BOUNCE = "BOUNCE",
    COMPLAINT = "COMPLAINT",
    DELIVERY = "DELIVERY"
}
export declare enum ApiErrorCode {
    BAD_REQUEST = "BAD_REQUEST",
    UNAUTHORIZED = "UNAUTHORIZED",
    FORBIDDEN = "FORBIDDEN",
    CONFLICT = "CONFLICT",
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
    TIMEOUT = "TIMEOUT",
    SES_ERROR = "SES_ERROR",
    DATABASE_ERROR = "DATABASE_ERROR",
    REDIS_ERROR = "REDIS_ERROR"
}
export declare enum FailureReason {
    VALIDATION_ERROR = "validation-error",
    RATE_LIMIT = "rate-limit",
    SES_TEMPORARY = "ses-temporary",
    SES_PERMANENT = "ses-permanent",
    SES_TIMEOUT = "ses-timeout",
    NETWORK_ERROR = "network-error",
    INTERNAL_ERROR = "internal-error"
}
export interface IRecipient {
    id: string;
    companyId: string;
    externalId?: string;
    cpfCnpjHash?: string;
    cpfCnpjEnc?: Buffer;
    razaoSocial?: string;
    nome?: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export interface IEmailOutbox {
    id: string;
    companyId: string;
    recipientId?: string;
    externalId?: string;
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    htmlRef: string;
    replyTo?: string;
    headers?: Record<string, string>;
    tags?: string[];
    status: EmailStatus;
    requestId: string;
    idempotencyKey?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface IEmailLog {
    id: string;
    companyId: string;
    outboxId: string;
    recipientId?: string;
    sesMessageId?: string;
    to: string;
    subject: string;
    status: EmailStatus;
    errorCode?: string;
    errorReason?: FailureReason;
    errorMessage?: string;
    attempts: number;
    durationMs?: number;
    requestId: string;
    createdAt: Date;
    sentAt?: Date;
    failedAt?: Date;
}
export interface IEmailEvent {
    id: string;
    emailLogId: string;
    type: EmailEventType;
    metadata?: Record<string, any>;
    timestamp: Date;
}
export interface IEmailJob {
    jobId: string;
    outboxId: string;
    companyId: string;
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    htmlRef: string;
    replyTo?: string;
    headers?: Record<string, string>;
    tags?: string[];
    recipient?: {
        recipientId?: string;
        externalId?: string;
        cpfCnpjHash?: string;
        razaoSocial?: string;
        nome?: string;
        email: string;
    };
    attempt: number;
    enqueueAt: Date;
    requestId: string;
}
export interface ICompany {
    id: string;
    name: string;
    apiKey: string;
    apiKeyActive: boolean;
    allowedIps?: string[];
    rateLimitPerMinute: number;
    rateLimitPerHour: number;
    rateLimitPerDay: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface IIdempotencyKey {
    key: string;
    companyId: string;
    outboxId: string;
    payloadHash: string;
    createdAt: Date;
    expiresAt: Date;
}
export interface IEmailDetailResponse {
    id: string;
    companyId: string;
    status: EmailStatus;
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    recipient?: {
        externalId?: string;
        nome?: string;
        razaoSocial?: string;
        email: string;
        cpfCnpj?: string;
    };
    externalId?: string;
    sesMessageId?: string;
    attempts: number;
    errorCode?: string;
    errorMessage?: string;
    requestId: string;
    createdAt: string;
    sentAt?: string;
    failedAt?: string;
    events: Array<{
        type: EmailEventType;
        timestamp: string;
        metadata?: Record<string, any>;
    }>;
}
export interface IEmailListItem {
    id: string;
    status: EmailStatus;
    to: string;
    subject: string;
    recipientName?: string;
    externalId?: string;
    attempts: number;
    createdAt: string;
    sentAt?: string;
}
export interface IEmailListResponse {
    data: IEmailListItem[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}
export interface IEmailListFilters {
    status?: EmailStatus;
    dateFrom?: string;
    dateTo?: string;
    to?: string;
    recipientExternalId?: string;
    cpfCnpj?: string;
    razaoSocial?: string;
    nome?: string;
    externalId?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
}
export interface IAuthContext {
    company: ICompany;
    clientIp: string;
    requestId: string;
    timestamp: Date;
}
export interface IWorkerContext {
    workerId: string;
    jobId: string;
    attempt: number;
    requestId: string;
    startedAt: Date;
}
export interface IValidationResult {
    valid: boolean;
    errors?: Array<{
        field: string;
        message: string;
        value?: any;
    }>;
}
export type AsyncResult<T, E = Error> = {
    success: true;
    data: T;
} | {
    success: false;
    error: E;
};
export interface IRetryConfig {
    maxAttempts: number;
    backoffBase: number;
    backoffMultiplier: number;
    maxBackoff: number;
}
export interface IQueueMetrics {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    dlq: number;
    delayed: number;
}
export interface ISendMetrics {
    total: number;
    sent: number;
    failed: number;
    successRate: number;
    avgQueueTime: number;
    avgProcessingTime: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
}
export declare function isTerminalStatus(status: EmailStatus): boolean;
export declare function isSuccessStatus(status: EmailStatus): boolean;
export declare function isFailureStatus(status: EmailStatus): boolean;
export declare function isProcessingStatus(status: EmailStatus): boolean;
export declare function isTemporaryFailure(reason: FailureReason): boolean;
export declare function isPermanentFailure(reason: FailureReason): boolean;
export declare const PROCESSABLE_STATUSES: EmailStatus[];
export declare const TERMINAL_STATUSES: EmailStatus[];
export declare const SUCCESS_EVENTS: EmailEventType[];
export declare const FAILURE_EVENTS: EmailEventType[];
