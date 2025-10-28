export declare enum EmailPipelineState {
    RECEIVED = "RECEIVED",
    VALIDATED = "VALIDATED",
    SENT_ATTEMPT = "SENT_ATTEMPT",
    SENT = "SENT",
    FAILED = "FAILED",
    RETRY_SCHEDULED = "RETRY_SCHEDULED"
}
export declare enum ValidationType {
    INTEGRITY = "INTEGRITY",
    OUTBOX = "OUTBOX",
    RECIPIENT = "RECIPIENT",
    TEMPLATE = "TEMPLATE"
}
export declare enum ErrorCategory {
    VALIDATION_ERROR = "VALIDATION_ERROR",
    TRANSIENT_ERROR = "TRANSIENT_ERROR",
    PERMANENT_ERROR = "PERMANENT_ERROR",
    QUOTA_ERROR = "QUOTA_ERROR",
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
    TIMEOUT_ERROR = "TIMEOUT_ERROR"
}
export declare enum ErrorCode {
    INVALID_PAYLOAD = "INVALID_PAYLOAD",
    OUTBOX_NOT_FOUND = "OUTBOX_NOT_FOUND",
    RECIPIENT_NOT_FOUND = "RECIPIENT_NOT_FOUND",
    INVALID_TEMPLATE = "INVALID_TEMPLATE",
    INVALID_EMAIL = "INVALID_EMAIL",
    SES_MESSAGE_REJECTED = "SES_MESSAGE_REJECTED",
    SES_MAIL_FROM_DOMAIN_NOT_VERIFIED = "SES_MAIL_FROM_DOMAIN_NOT_VERIFIED",
    SES_CONFIGURATION_SET_DOES_NOT_EXIST = "SES_CONFIGURATION_SET_DOES_NOT_EXIST",
    SES_ACCOUNT_SENDING_PAUSED = "SES_ACCOUNT_SENDING_PAUSED",
    SES_SERVICE_UNAVAILABLE = "SES_SERVICE_UNAVAILABLE",
    SES_THROTTLING = "SES_THROTTLING",
    SES_TIMEOUT = "SES_TIMEOUT",
    SES_CIRCUIT_OPEN = "SES_CIRCUIT_OPEN",
    SES_DAILY_QUOTA_EXCEEDED = "SES_DAILY_QUOTA_EXCEEDED",
    SES_MAX_SEND_RATE_EXCEEDED = "SES_MAX_SEND_RATE_EXCEEDED",
    NETWORK_ERROR = "NETWORK_ERROR",
    DNS_ERROR = "DNS_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
export interface SESErrorMapping {
    sesErrorCode: string;
    errorCode: ErrorCode;
    category: ErrorCategory;
    retryable: boolean;
    message: string;
}
export interface ValidationResult {
    type: ValidationType;
    success: boolean;
    error?: string;
    errorCode?: ErrorCode;
    metadata?: Record<string, unknown>;
}
export interface PipelineContext {
    jobId: string;
    requestId: string;
    companyId: string;
    outboxId: string;
    state: EmailPipelineState;
    attempt: number;
    startedAt: Date;
    validations: ValidationResult[];
    sesMessageId?: string;
    error?: {
        code: ErrorCode;
        category: ErrorCategory;
        message: string;
        retryable: boolean;
        metadata?: Record<string, unknown>;
    };
}
export declare const PIPELINE_CONSTANTS: {
    readonly SES_SEND_TIMEOUT_MS: 30000;
    readonly VALIDATION_TIMEOUT_MS: 5000;
    readonly MAX_HTML_SIZE_BYTES: number;
    readonly MAX_SUBJECT_LENGTH: 150;
};
export declare const SES_ERROR_MAPPINGS: Record<string, Omit<SESErrorMapping, 'sesErrorCode'>>;
