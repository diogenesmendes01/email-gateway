"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorResponseSchema = exports.errorDetailSchema = exports.emailSendResponseSchema = exports.emailSendHeadersSchema = exports.emailSendBodySchema = exports.customHeadersSchema = exports.recipientSchema = exports.cpfCnpjSchema = exports.tagSchema = exports.externalIdSchema = exports.emailSchema = exports.LIMITS = void 0;
exports.validatePayloadSize = validatePayloadSize;
exports.normalizeCpfCnpj = normalizeCpfCnpj;
exports.maskCpfCnpj = maskCpfCnpj;
exports.hashCpfCnpj = hashCpfCnpj;
exports.sanitizeSubject = sanitizeSubject;
exports.generateRequestId = generateRequestId;
const zod_1 = require("zod");
const html_sanitization_util_1 = require("../utils/html-sanitization.util");
const attachment_schema_1 = require("./attachment.schema");
exports.LIMITS = {
    MAX_PAYLOAD_SIZE: 1_048_576,
    MAX_HTML_SIZE: 1_048_576,
    MAX_EMAIL_LENGTH: 254,
    MAX_SUBJECT_LENGTH: 150,
    MIN_SUBJECT_LENGTH: 1,
    MAX_HEADER_KEY_LENGTH: 64,
    MAX_HEADER_VALUE_LENGTH: 256,
    MAX_TAG_LENGTH: 32,
    MAX_EXTERNAL_ID_LENGTH: 64,
    MIN_EXTERNAL_ID_LENGTH: 1,
    MAX_IDEMPOTENCY_KEY_LENGTH: 128,
    MAX_NOME_LENGTH: 120,
    MIN_NOME_LENGTH: 1,
    MAX_RAZAO_SOCIAL_LENGTH: 150,
    MIN_RAZAO_SOCIAL_LENGTH: 1,
    CPF_LENGTH: 11,
    CNPJ_LENGTH: 14,
    MAX_CC_COUNT: 5,
    MAX_BCC_COUNT: 5,
    MAX_TAGS_COUNT: 5,
    MAX_HEADERS_COUNT: 10,
};
const PATTERNS = {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    externalId: /^[a-zA-Z0-9_-]+$/,
    tag: /^[a-zA-Z0-9_-]+$/,
    cpfCnpj: /^\d+$/,
    idempotencyKey: /^[a-zA-Z0-9_-]+$/,
    customHeader: /^(X-Custom-[a-zA-Z0-9_-]+|X-Priority)$/,
};
function validateCPF(cpf) {
    if (cpf.length !== exports.LIMITS.CPF_LENGTH)
        return false;
    if (/^(\d)\1+$/.test(cpf))
        return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let digit = 11 - (sum % 11);
    if (digit >= 10)
        digit = 0;
    if (digit !== parseInt(cpf.charAt(9)))
        return false;
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    digit = 11 - (sum % 11);
    if (digit >= 10)
        digit = 0;
    if (digit !== parseInt(cpf.charAt(10)))
        return false;
    return true;
}
function validateCNPJ(cnpj) {
    if (cnpj.length !== exports.LIMITS.CNPJ_LENGTH)
        return false;
    if (/^(\d)\1+$/.test(cnpj))
        return false;
    let sum = 0;
    let weight = 5;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(cnpj.charAt(i)) * weight;
        weight = weight === 2 ? 9 : weight - 1;
    }
    let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (digit !== parseInt(cnpj.charAt(12)))
        return false;
    sum = 0;
    weight = 6;
    for (let i = 0; i < 13; i++) {
        sum += parseInt(cnpj.charAt(i)) * weight;
        weight = weight === 2 ? 9 : weight - 1;
    }
    digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (digit !== parseInt(cnpj.charAt(13)))
        return false;
    return true;
}
function validateCpfCnpj(value) {
    if (!PATTERNS.cpfCnpj.test(value))
        return false;
    if (value.length === exports.LIMITS.CPF_LENGTH) {
        return validateCPF(value);
    }
    else if (value.length === exports.LIMITS.CNPJ_LENGTH) {
        return validateCNPJ(value);
    }
    return false;
}
exports.emailSchema = zod_1.z
    .string()
    .max(exports.LIMITS.MAX_EMAIL_LENGTH, `Email must not exceed ${exports.LIMITS.MAX_EMAIL_LENGTH} characters`)
    .regex(PATTERNS.email, 'Invalid email format')
    .transform((val) => val.toLowerCase().trim());
exports.externalIdSchema = zod_1.z
    .string()
    .min(exports.LIMITS.MIN_EXTERNAL_ID_LENGTH, `External ID must have at least ${exports.LIMITS.MIN_EXTERNAL_ID_LENGTH} character`)
    .max(exports.LIMITS.MAX_EXTERNAL_ID_LENGTH, `External ID must not exceed ${exports.LIMITS.MAX_EXTERNAL_ID_LENGTH} characters`)
    .regex(PATTERNS.externalId, 'External ID must contain only alphanumeric, hyphens, and underscores')
    .trim();
exports.tagSchema = zod_1.z
    .string()
    .min(1, 'Tag must have at least 1 character')
    .max(exports.LIMITS.MAX_TAG_LENGTH, `Tag must not exceed ${exports.LIMITS.MAX_TAG_LENGTH} characters`)
    .regex(PATTERNS.tag, 'Tag must contain only alphanumeric, hyphens, and underscores')
    .trim();
exports.cpfCnpjSchema = zod_1.z
    .string()
    .regex(PATTERNS.cpfCnpj, 'CPF/CNPJ must contain only digits')
    .refine((val) => val.length === exports.LIMITS.CPF_LENGTH || val.length === exports.LIMITS.CNPJ_LENGTH, `CPF must have ${exports.LIMITS.CPF_LENGTH} digits or CNPJ must have ${exports.LIMITS.CNPJ_LENGTH} digits`)
    .refine((val) => validateCpfCnpj(val), 'Invalid CPF or CNPJ: check digits do not match');
exports.recipientSchema = zod_1.z.object({
    externalId: exports.externalIdSchema.optional(),
    cpfCnpj: exports.cpfCnpjSchema.optional(),
    razaoSocial: zod_1.z
        .string()
        .min(exports.LIMITS.MIN_RAZAO_SOCIAL_LENGTH, `Razão social must have at least ${exports.LIMITS.MIN_RAZAO_SOCIAL_LENGTH} character`)
        .max(exports.LIMITS.MAX_RAZAO_SOCIAL_LENGTH, `Razão social must not exceed ${exports.LIMITS.MAX_RAZAO_SOCIAL_LENGTH} characters`)
        .trim()
        .optional(),
    nome: zod_1.z
        .string()
        .min(exports.LIMITS.MIN_NOME_LENGTH, `Nome must have at least ${exports.LIMITS.MIN_NOME_LENGTH} character`)
        .max(exports.LIMITS.MAX_NOME_LENGTH, `Nome must not exceed ${exports.LIMITS.MAX_NOME_LENGTH} characters`)
        .trim()
        .optional(),
    email: exports.emailSchema.optional(),
}).strict();
exports.customHeadersSchema = zod_1.z
    .record(zod_1.z
    .string()
    .max(exports.LIMITS.MAX_HEADER_KEY_LENGTH, `Header key must not exceed ${exports.LIMITS.MAX_HEADER_KEY_LENGTH} characters`)
    .regex(PATTERNS.customHeader, 'Header must be X-Custom-* or X-Priority'), zod_1.z
    .string()
    .max(exports.LIMITS.MAX_HEADER_VALUE_LENGTH, `Header value must not exceed ${exports.LIMITS.MAX_HEADER_VALUE_LENGTH} characters`))
    .refine((headers) => Object.keys(headers).length <= exports.LIMITS.MAX_HEADERS_COUNT, `Maximum of ${exports.LIMITS.MAX_HEADERS_COUNT} custom headers allowed`)
    .optional();
exports.emailSendBodySchema = zod_1.z.object({
    to: exports.emailSchema,
    cc: zod_1.z
        .array(exports.emailSchema)
        .max(exports.LIMITS.MAX_CC_COUNT, `Maximum of ${exports.LIMITS.MAX_CC_COUNT} CC addresses allowed`)
        .optional(),
    bcc: zod_1.z
        .array(exports.emailSchema)
        .max(exports.LIMITS.MAX_BCC_COUNT, `Maximum of ${exports.LIMITS.MAX_BCC_COUNT} BCC addresses allowed`)
        .optional(),
    subject: zod_1.z
        .string()
        .min(exports.LIMITS.MIN_SUBJECT_LENGTH, `Subject must have at least ${exports.LIMITS.MIN_SUBJECT_LENGTH} character`)
        .max(exports.LIMITS.MAX_SUBJECT_LENGTH, `Subject must not exceed ${exports.LIMITS.MAX_SUBJECT_LENGTH} characters`)
        .refine((val) => !/[\n\r]/.test(val), 'Subject must not contain line breaks')
        .transform((val) => val.trim()),
    html: zod_1.z
        .string()
        .min(1, 'HTML content is required')
        .max(exports.LIMITS.MAX_HTML_SIZE, `HTML content must not exceed ${exports.LIMITS.MAX_HTML_SIZE} bytes`)
        .refine((val) => Buffer.byteLength(val, 'utf8') <= exports.LIMITS.MAX_HTML_SIZE, `HTML content size must not exceed ${exports.LIMITS.MAX_HTML_SIZE} bytes`)
        .transform((val) => (0, html_sanitization_util_1.sanitizeEmailHtml)(val)),
    replyTo: exports.emailSchema.optional(),
    headers: exports.customHeadersSchema,
    tags: zod_1.z
        .array(exports.tagSchema)
        .max(exports.LIMITS.MAX_TAGS_COUNT, `Maximum of ${exports.LIMITS.MAX_TAGS_COUNT} tags allowed`)
        .optional(),
    recipient: exports.recipientSchema.optional(),
    externalId: exports.externalIdSchema.optional(),
    attachments: zod_1.z
        .array(attachment_schema_1.attachmentSchema)
        .max(attachment_schema_1.ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_EMAIL, `Maximum of ${attachment_schema_1.ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_EMAIL} attachments allowed`)
        .optional()
        .refine((attachments) => {
        if (!attachments || attachments.length === 0)
            return true;
        const result = (0, attachment_schema_1.validateAttachmentConstraints)(attachments);
        return result.valid;
    }, (attachments) => {
        if (!attachments)
            return { message: 'Invalid attachments' };
        const result = (0, attachment_schema_1.validateAttachmentConstraints)(attachments);
        return { message: result.error || 'Invalid attachments' };
    }),
}).strict()
    .refine((data) => {
    if (data.recipient?.email && data.recipient.email !== data.to) {
        return false;
    }
    return true;
}, {
    message: "recipient.email must match 'to' field",
    path: ['recipient', 'email'],
});
exports.emailSendHeadersSchema = zod_1.z.object({
    'x-api-key': zod_1.z
        .string()
        .min(1, 'X-API-Key is required'),
    'content-type': zod_1.z
        .string()
        .refine((val) => val.toLowerCase().includes('application/json'), 'Content-Type must be application/json'),
    'idempotency-key': zod_1.z
        .string()
        .max(exports.LIMITS.MAX_IDEMPOTENCY_KEY_LENGTH, `Idempotency-Key must not exceed ${exports.LIMITS.MAX_IDEMPOTENCY_KEY_LENGTH} characters`)
        .regex(PATTERNS.idempotencyKey, 'Idempotency-Key must contain only alphanumeric, hyphens, and underscores')
        .optional(),
    'x-request-id': zod_1.z
        .string()
        .max(exports.LIMITS.MAX_IDEMPOTENCY_KEY_LENGTH, `X-Request-Id must not exceed ${exports.LIMITS.MAX_IDEMPOTENCY_KEY_LENGTH} characters`)
        .optional(),
}).passthrough();
exports.emailSendResponseSchema = zod_1.z.object({
    outboxId: zod_1.z.string().uuid(),
    jobId: zod_1.z.string().uuid(),
    requestId: zod_1.z.string(),
    status: zod_1.z.literal('ENQUEUED'),
    receivedAt: zod_1.z.string().datetime(),
    recipient: zod_1.z.object({
        externalId: zod_1.z.string().optional(),
    }).optional(),
}).strict();
exports.errorDetailSchema = zod_1.z.object({
    field: zod_1.z.string(),
    message: zod_1.z.string(),
    value: zod_1.z.any().optional(),
}).strict();
exports.errorResponseSchema = zod_1.z.object({
    error: zod_1.z.object({
        code: zod_1.z.string(),
        message: zod_1.z.string(),
        requestId: zod_1.z.string(),
        timestamp: zod_1.z.string().datetime(),
        details: zod_1.z.array(exports.errorDetailSchema).optional(),
    }).strict(),
}).strict();
function validatePayloadSize(payload) {
    return Buffer.byteLength(payload, 'utf8') <= exports.LIMITS.MAX_PAYLOAD_SIZE;
}
function normalizeCpfCnpj(cpfCnpj) {
    return cpfCnpj.replace(/[^\d]/g, '');
}
function maskCpfCnpj(cpfCnpj) {
    const normalized = normalizeCpfCnpj(cpfCnpj);
    if (normalized.length === exports.LIMITS.CPF_LENGTH) {
        return `***.${normalized.substring(3, 6)}.${normalized.substring(6, 9)}-**`;
    }
    else if (normalized.length === exports.LIMITS.CNPJ_LENGTH) {
        return `**.${normalized.substring(2, 5)}.${normalized.substring(5, 8)}/${normalized.substring(8, 12)}-**`;
    }
    return cpfCnpj;
}
async function hashCpfCnpj(cpfCnpj) {
    const normalized = normalizeCpfCnpj(cpfCnpj);
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
function sanitizeSubject(subject) {
    return subject.replace(/[\n\r]/g, ' ').trim();
}
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
//# sourceMappingURL=email-send.schema.js.map