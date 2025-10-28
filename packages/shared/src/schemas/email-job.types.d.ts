export declare const EMAIL_JOB_VALIDATION: {
    readonly MAX_EMAIL_LENGTH: 254;
    readonly MAX_SUBJECT_LENGTH: 150;
    readonly MAX_HTML_REF_LENGTH: 512;
    readonly MAX_REQUEST_ID_LENGTH: 128;
    readonly MAX_NAME_LENGTH: 120;
    readonly MAX_RAZAO_SOCIAL_LENGTH: 150;
    readonly MAX_EXTERNAL_ID_LENGTH: 64;
    readonly SHA256_HEX_LENGTH: 64;
    readonly MAX_CC_BCC_RECIPIENTS: 5;
    readonly MAX_TAGS: 5;
    readonly MAX_TAG_LENGTH: 50;
    readonly MAX_SES_MESSAGE_ID_LENGTH: 128;
    readonly MAX_ERROR_CODE_LENGTH: 64;
    readonly MAX_ERROR_REASON_LENGTH: 500;
    readonly MIN_PRIORITY: 1;
    readonly MAX_PRIORITY: 10;
};
export declare const EMAIL_JOB_CONFIG: {
    readonly QUEUE_NAME: "email-send";
    readonly DEFAULT_TTL: number;
    readonly DEFAULT_PRIORITY: 5;
    readonly MAX_ATTEMPTS: 5;
    readonly BACKOFF_DELAYS: readonly [1, 5, 30, 120, 600];
    readonly DLQ_TTL: number;
};
