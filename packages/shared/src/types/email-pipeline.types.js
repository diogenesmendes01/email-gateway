"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SES_ERROR_MAPPINGS = exports.PIPELINE_CONSTANTS = exports.ErrorCode = exports.ErrorCategory = exports.ValidationType = exports.EmailPipelineState = void 0;
var EmailPipelineState;
(function (EmailPipelineState) {
    EmailPipelineState["RECEIVED"] = "RECEIVED";
    EmailPipelineState["VALIDATED"] = "VALIDATED";
    EmailPipelineState["SENT_ATTEMPT"] = "SENT_ATTEMPT";
    EmailPipelineState["SENT"] = "SENT";
    EmailPipelineState["FAILED"] = "FAILED";
    EmailPipelineState["RETRY_SCHEDULED"] = "RETRY_SCHEDULED";
})(EmailPipelineState || (exports.EmailPipelineState = EmailPipelineState = {}));
var ValidationType;
(function (ValidationType) {
    ValidationType["INTEGRITY"] = "INTEGRITY";
    ValidationType["OUTBOX"] = "OUTBOX";
    ValidationType["RECIPIENT"] = "RECIPIENT";
    ValidationType["TEMPLATE"] = "TEMPLATE";
})(ValidationType || (exports.ValidationType = ValidationType = {}));
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCategory["TRANSIENT_ERROR"] = "TRANSIENT_ERROR";
    ErrorCategory["PERMANENT_ERROR"] = "PERMANENT_ERROR";
    ErrorCategory["QUOTA_ERROR"] = "QUOTA_ERROR";
    ErrorCategory["CONFIGURATION_ERROR"] = "CONFIGURATION_ERROR";
    ErrorCategory["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["INVALID_PAYLOAD"] = "INVALID_PAYLOAD";
    ErrorCode["OUTBOX_NOT_FOUND"] = "OUTBOX_NOT_FOUND";
    ErrorCode["RECIPIENT_NOT_FOUND"] = "RECIPIENT_NOT_FOUND";
    ErrorCode["INVALID_TEMPLATE"] = "INVALID_TEMPLATE";
    ErrorCode["INVALID_EMAIL"] = "INVALID_EMAIL";
    ErrorCode["SES_MESSAGE_REJECTED"] = "SES_MESSAGE_REJECTED";
    ErrorCode["SES_MAIL_FROM_DOMAIN_NOT_VERIFIED"] = "SES_MAIL_FROM_DOMAIN_NOT_VERIFIED";
    ErrorCode["SES_CONFIGURATION_SET_DOES_NOT_EXIST"] = "SES_CONFIGURATION_SET_DOES_NOT_EXIST";
    ErrorCode["SES_ACCOUNT_SENDING_PAUSED"] = "SES_ACCOUNT_SENDING_PAUSED";
    ErrorCode["SES_SERVICE_UNAVAILABLE"] = "SES_SERVICE_UNAVAILABLE";
    ErrorCode["SES_THROTTLING"] = "SES_THROTTLING";
    ErrorCode["SES_TIMEOUT"] = "SES_TIMEOUT";
    ErrorCode["SES_CIRCUIT_OPEN"] = "SES_CIRCUIT_OPEN";
    ErrorCode["SES_DAILY_QUOTA_EXCEEDED"] = "SES_DAILY_QUOTA_EXCEEDED";
    ErrorCode["SES_MAX_SEND_RATE_EXCEEDED"] = "SES_MAX_SEND_RATE_EXCEEDED";
    ErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    ErrorCode["DNS_ERROR"] = "DNS_ERROR";
    ErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
exports.PIPELINE_CONSTANTS = {
    SES_SEND_TIMEOUT_MS: 30000,
    VALIDATION_TIMEOUT_MS: 5000,
    MAX_HTML_SIZE_BYTES: 512 * 1024,
    MAX_SUBJECT_LENGTH: 150,
};
exports.SES_ERROR_MAPPINGS = {
    'MessageRejected': {
        errorCode: ErrorCode.SES_MESSAGE_REJECTED,
        category: ErrorCategory.PERMANENT_ERROR,
        retryable: false,
        message: 'Mensagem rejeitada pelo SES (conteúdo inválido ou destinatário bloqueado)',
    },
    'MailFromDomainNotVerified': {
        errorCode: ErrorCode.SES_MAIL_FROM_DOMAIN_NOT_VERIFIED,
        category: ErrorCategory.CONFIGURATION_ERROR,
        retryable: false,
        message: 'Domínio de envio não verificado no SES',
    },
    'ConfigurationSetDoesNotExist': {
        errorCode: ErrorCode.SES_CONFIGURATION_SET_DOES_NOT_EXIST,
        category: ErrorCategory.CONFIGURATION_ERROR,
        retryable: false,
        message: 'Configuration Set não existe no SES',
    },
    'AccountSendingPausedException': {
        errorCode: ErrorCode.SES_ACCOUNT_SENDING_PAUSED,
        category: ErrorCategory.PERMANENT_ERROR,
        retryable: false,
        message: 'Conta SES pausada (violação de políticas)',
    },
    'Throttling': {
        errorCode: ErrorCode.SES_THROTTLING,
        category: ErrorCategory.QUOTA_ERROR,
        retryable: true,
        message: 'Taxa de envio excedida (rate limiting)',
    },
    'MaxSendRateExceeded': {
        errorCode: ErrorCode.SES_MAX_SEND_RATE_EXCEEDED,
        category: ErrorCategory.QUOTA_ERROR,
        retryable: true,
        message: 'Taxa máxima de envio por segundo excedida',
    },
    'DailyQuotaExceeded': {
        errorCode: ErrorCode.SES_DAILY_QUOTA_EXCEEDED,
        category: ErrorCategory.QUOTA_ERROR,
        retryable: true,
        message: 'Quota diária de envios excedida',
    },
    'ServiceUnavailable': {
        errorCode: ErrorCode.SES_SERVICE_UNAVAILABLE,
        category: ErrorCategory.TRANSIENT_ERROR,
        retryable: true,
        message: 'Serviço SES temporariamente indisponível',
    },
    'RequestTimeout': {
        errorCode: ErrorCode.SES_TIMEOUT,
        category: ErrorCategory.TIMEOUT_ERROR,
        retryable: true,
        message: 'Timeout na requisição ao SES',
    },
    'NetworkingError': {
        errorCode: ErrorCode.NETWORK_ERROR,
        category: ErrorCategory.TRANSIENT_ERROR,
        retryable: true,
        message: 'Erro de rede ao conectar com SES',
    },
};
//# sourceMappingURL=email-pipeline.types.js.map