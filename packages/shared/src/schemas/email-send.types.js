"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAILURE_EVENTS = exports.SUCCESS_EVENTS = exports.TERMINAL_STATUSES = exports.PROCESSABLE_STATUSES = exports.FailureReason = exports.ApiErrorCode = exports.EmailEventType = exports.EmailStatus = void 0;
exports.isTerminalStatus = isTerminalStatus;
exports.isSuccessStatus = isSuccessStatus;
exports.isFailureStatus = isFailureStatus;
exports.isProcessingStatus = isProcessingStatus;
exports.isTemporaryFailure = isTemporaryFailure;
exports.isPermanentFailure = isPermanentFailure;
var EmailStatus;
(function (EmailStatus) {
    EmailStatus["PENDING"] = "PENDING";
    EmailStatus["ENQUEUED"] = "ENQUEUED";
    EmailStatus["PROCESSING"] = "PROCESSING";
    EmailStatus["SENT"] = "SENT";
    EmailStatus["FAILED"] = "FAILED";
    EmailStatus["RETRYING"] = "RETRYING";
})(EmailStatus || (exports.EmailStatus = EmailStatus = {}));
var EmailEventType;
(function (EmailEventType) {
    EmailEventType["CREATED"] = "CREATED";
    EmailEventType["ENQUEUED"] = "ENQUEUED";
    EmailEventType["PROCESSING"] = "PROCESSING";
    EmailEventType["SENT"] = "SENT";
    EmailEventType["FAILED"] = "FAILED";
    EmailEventType["RETRY"] = "RETRY";
    EmailEventType["DLQ"] = "DLQ";
    EmailEventType["BOUNCE"] = "BOUNCE";
    EmailEventType["COMPLAINT"] = "COMPLAINT";
    EmailEventType["DELIVERY"] = "DELIVERY";
})(EmailEventType || (exports.EmailEventType = EmailEventType = {}));
var ApiErrorCode;
(function (ApiErrorCode) {
    ApiErrorCode["BAD_REQUEST"] = "BAD_REQUEST";
    ApiErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ApiErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ApiErrorCode["CONFLICT"] = "CONFLICT";
    ApiErrorCode["PAYLOAD_TOO_LARGE"] = "PAYLOAD_TOO_LARGE";
    ApiErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ApiErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ApiErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ApiErrorCode["SERVICE_UNAVAILABLE"] = "SERVICE_UNAVAILABLE";
    ApiErrorCode["TIMEOUT"] = "TIMEOUT";
    ApiErrorCode["SES_ERROR"] = "SES_ERROR";
    ApiErrorCode["DATABASE_ERROR"] = "DATABASE_ERROR";
    ApiErrorCode["REDIS_ERROR"] = "REDIS_ERROR";
})(ApiErrorCode || (exports.ApiErrorCode = ApiErrorCode = {}));
var FailureReason;
(function (FailureReason) {
    FailureReason["VALIDATION_ERROR"] = "validation-error";
    FailureReason["RATE_LIMIT"] = "rate-limit";
    FailureReason["SES_TEMPORARY"] = "ses-temporary";
    FailureReason["SES_PERMANENT"] = "ses-permanent";
    FailureReason["SES_TIMEOUT"] = "ses-timeout";
    FailureReason["NETWORK_ERROR"] = "network-error";
    FailureReason["INTERNAL_ERROR"] = "internal-error";
})(FailureReason || (exports.FailureReason = FailureReason = {}));
function isTerminalStatus(status) {
    return status === EmailStatus.SENT || status === EmailStatus.FAILED;
}
function isSuccessStatus(status) {
    return status === EmailStatus.SENT;
}
function isFailureStatus(status) {
    return status === EmailStatus.FAILED;
}
function isProcessingStatus(status) {
    return (status === EmailStatus.ENQUEUED ||
        status === EmailStatus.PROCESSING ||
        status === EmailStatus.RETRYING);
}
function isTemporaryFailure(reason) {
    return (reason === FailureReason.SES_TEMPORARY ||
        reason === FailureReason.NETWORK_ERROR ||
        reason === FailureReason.SES_TIMEOUT ||
        reason === FailureReason.RATE_LIMIT);
}
function isPermanentFailure(reason) {
    return (reason === FailureReason.VALIDATION_ERROR ||
        reason === FailureReason.SES_PERMANENT);
}
exports.PROCESSABLE_STATUSES = [
    EmailStatus.PENDING,
    EmailStatus.ENQUEUED,
    EmailStatus.PROCESSING,
    EmailStatus.RETRYING,
];
exports.TERMINAL_STATUSES = [
    EmailStatus.SENT,
    EmailStatus.FAILED,
];
exports.SUCCESS_EVENTS = [
    EmailEventType.SENT,
    EmailEventType.DELIVERY,
];
exports.FAILURE_EVENTS = [
    EmailEventType.FAILED,
    EmailEventType.BOUNCE,
    EmailEventType.COMPLAINT,
    EmailEventType.DLQ,
];
//# sourceMappingURL=email-send.types.js.map