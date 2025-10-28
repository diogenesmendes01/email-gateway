"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailDetailResponseSchema = exports.emailEventResponseSchema = exports.recipientResponseSchema = exports.emailListResponseSchema = exports.emailListItemSchema = exports.paginationMetaSchema = exports.cursorPaginationMetaSchema = exports.offsetPaginationMetaSchema = exports.emailByIdParamsSchema = exports.emailListQuerySchema = exports.emailFiltersSchema = exports.sortSchema = exports.paginationSchema = exports.cursorPaginationSchema = exports.offsetPaginationSchema = exports.tagsFilterSchema = exports.nameFilterSchema = exports.externalIdFilterSchema = exports.cpfCnpjFilterSchema = exports.emailFilterSchema = exports.isoDateTimeSchema = exports.EmailStatusFilter = exports.SORT_DIRECTIONS = exports.SORTABLE_FIELDS = exports.QUERY_LIMITS = void 0;
exports.parseSortParam = parseSortParam;
exports.encodeCursor = encodeCursor;
exports.decodeCursor = decodeCursor;
const zod_1 = require("zod");
exports.QUERY_LIMITS = {
    MAX_PAGE_SIZE: 100,
    MIN_PAGE_SIZE: 1,
    DEFAULT_PAGE_SIZE: 20,
    MIN_PAGE: 1,
    CURSOR_EXPIRATION_HOURS: 24,
    MAX_FILTERS: 10,
};
exports.SORTABLE_FIELDS = [
    'createdAt',
    'sentAt',
    'status',
    'to',
];
exports.SORT_DIRECTIONS = ['asc', 'desc'];
var EmailStatusFilter;
(function (EmailStatusFilter) {
    EmailStatusFilter["PENDING"] = "PENDING";
    EmailStatusFilter["ENQUEUED"] = "ENQUEUED";
    EmailStatusFilter["PROCESSING"] = "PROCESSING";
    EmailStatusFilter["SENT"] = "SENT";
    EmailStatusFilter["FAILED"] = "FAILED";
    EmailStatusFilter["RETRYING"] = "RETRYING";
})(EmailStatusFilter || (exports.EmailStatusFilter = EmailStatusFilter = {}));
exports.isoDateTimeSchema = zod_1.z.string()
    .datetime({ message: 'Must be a valid ISO 8601 datetime string' })
    .describe('ISO 8601 datetime (e.g., 2025-10-19T14:30:00.000Z)');
exports.emailFilterSchema = zod_1.z.string()
    .email({ message: 'Must be a valid email address' })
    .max(254)
    .transform((val) => val.toLowerCase().trim());
exports.cpfCnpjFilterSchema = zod_1.z.string()
    .regex(/^\d+$/, 'CPF/CNPJ must contain only digits')
    .refine((val) => val.length === 11 || val.length === 14, 'CPF must have 11 digits, CNPJ must have 14 digits')
    .describe('CPF (11 digits) or CNPJ (14 digits), digits only');
exports.externalIdFilterSchema = zod_1.z.string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'External ID must be alphanumeric with hyphens/underscores only')
    .transform((val) => val.trim());
exports.nameFilterSchema = zod_1.z.string()
    .min(1)
    .max(150)
    .transform((val) => val.trim());
exports.tagsFilterSchema = zod_1.z.union([
    zod_1.z.string().transform((val) => val.split(',').map((t) => t.trim()).filter(Boolean)),
    zod_1.z.array(zod_1.z.string()),
]);
exports.offsetPaginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number()
        .int()
        .min(exports.QUERY_LIMITS.MIN_PAGE, `Page must be >= ${exports.QUERY_LIMITS.MIN_PAGE}`)
        .default(exports.QUERY_LIMITS.MIN_PAGE)
        .describe('Page number (1-indexed)'),
    pageSize: zod_1.z.coerce.number()
        .int()
        .min(exports.QUERY_LIMITS.MIN_PAGE_SIZE, `Page size must be >= ${exports.QUERY_LIMITS.MIN_PAGE_SIZE}`)
        .max(exports.QUERY_LIMITS.MAX_PAGE_SIZE, `Page size must be <= ${exports.QUERY_LIMITS.MAX_PAGE_SIZE}`)
        .default(exports.QUERY_LIMITS.DEFAULT_PAGE_SIZE)
        .describe('Number of items per page'),
}).strict();
exports.cursorPaginationSchema = zod_1.z.object({
    cursor: zod_1.z.string()
        .optional()
        .describe('Opaque cursor for pagination (base64 encoded)'),
    pageSize: zod_1.z.coerce.number()
        .int()
        .min(exports.QUERY_LIMITS.MIN_PAGE_SIZE)
        .max(exports.QUERY_LIMITS.MAX_PAGE_SIZE)
        .default(exports.QUERY_LIMITS.DEFAULT_PAGE_SIZE),
}).strict();
exports.paginationSchema = zod_1.z.union([
    exports.offsetPaginationSchema,
    exports.cursorPaginationSchema,
]).refine((data) => {
    return !('page' in data && 'cursor' in data);
}, { message: 'Cannot use both offset (page) and cursor pagination' });
exports.sortSchema = zod_1.z.string()
    .regex(/^[a-zA-Z]+:(asc|desc)$/, 'Sort must be in format: field:direction')
    .refine((val) => {
    const [field] = val.split(':');
    return exports.SORTABLE_FIELDS.includes(field);
}, {
    message: `Sortable fields: ${exports.SORTABLE_FIELDS.join(', ')}`,
})
    .default('createdAt:desc')
    .describe('Sort field and direction (e.g., createdAt:desc)');
exports.emailFiltersSchema = zod_1.z.object({
    status: zod_1.z.union([
        zod_1.z.nativeEnum(EmailStatusFilter),
        zod_1.z.string().transform((val) => val.split(',').map((s) => s.trim())),
    ]).optional()
        .describe('Filter by email status'),
    dateFrom: exports.isoDateTimeSchema.optional()
        .describe('Start date (inclusive)'),
    dateTo: exports.isoDateTimeSchema.optional()
        .describe('End date (inclusive)'),
    to: exports.emailFilterSchema.optional()
        .describe('Filter by recipient email address'),
    recipientExternalId: exports.externalIdFilterSchema.optional()
        .describe('Filter by recipient external ID'),
    cpfCnpj: exports.cpfCnpjFilterSchema.optional()
        .describe('Filter by recipient CPF/CNPJ'),
    razaoSocial: exports.nameFilterSchema.optional()
        .describe('Filter by recipient razão social (partial match)'),
    nome: exports.nameFilterSchema.optional()
        .describe('Filter by recipient nome (partial match)'),
    externalId: exports.externalIdFilterSchema.optional()
        .describe('Filter by send external ID'),
    tags: exports.tagsFilterSchema.optional()
        .describe('Filter by tags (comma-separated or array)'),
}).strict();
exports.emailListQuerySchema = exports.emailFiltersSchema.merge(zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).optional(),
    pageSize: zod_1.z.coerce.number().int().min(1).max(exports.QUERY_LIMITS.MAX_PAGE_SIZE).optional(),
    cursor: zod_1.z.string().optional(),
    sort: exports.sortSchema.optional(),
})).refine((data) => !('page' in data && 'cursor' in data), { message: 'Cannot use both offset (page) and cursor pagination' });
exports.emailByIdParamsSchema = zod_1.z.object({
    id: zod_1.z.string()
        .uuid({ message: 'ID must be a valid UUID' })
        .describe('Email ID (UUID)'),
}).strict();
exports.offsetPaginationMetaSchema = zod_1.z.object({
    page: zod_1.z.number().int().min(1),
    pageSize: zod_1.z.number().int().min(1).max(exports.QUERY_LIMITS.MAX_PAGE_SIZE),
    totalItems: zod_1.z.number().int().min(0),
    totalPages: zod_1.z.number().int().min(0),
    hasNext: zod_1.z.boolean(),
    hasPrev: zod_1.z.boolean(),
}).strict();
exports.cursorPaginationMetaSchema = zod_1.z.object({
    cursor: zod_1.z.object({
        next: zod_1.z.string().nullable(),
        prev: zod_1.z.string().nullable(),
    }).strict(),
}).strict();
exports.paginationMetaSchema = zod_1.z.union([
    exports.offsetPaginationMetaSchema,
    exports.offsetPaginationMetaSchema.merge(exports.cursorPaginationMetaSchema),
]);
exports.emailListItemSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    status: zod_1.z.nativeEnum(EmailStatusFilter),
    to: zod_1.z.string().email(),
    subject: zod_1.z.string(),
    recipientName: zod_1.z.string().nullable(),
    recipientExternalId: zod_1.z.string().nullable(),
    externalId: zod_1.z.string().nullable(),
    attempts: zod_1.z.number().int().min(0),
    tags: zod_1.z.array(zod_1.z.string()),
    createdAt: zod_1.z.string().datetime(),
    sentAt: zod_1.z.string().datetime().nullable(),
}).strict();
exports.emailListResponseSchema = zod_1.z.object({
    data: zod_1.z.array(exports.emailListItemSchema),
    pagination: exports.paginationMetaSchema,
}).strict();
exports.recipientResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    externalId: zod_1.z.string().nullable(),
    nome: zod_1.z.string().nullable(),
    razaoSocial: zod_1.z.string().nullable(),
    email: zod_1.z.string().email(),
    cpfCnpj: zod_1.z.string().nullable(),
}).strict();
exports.emailEventResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.enum([
        'CREATED',
        'ENQUEUED',
        'PROCESSING',
        'SENT',
        'FAILED',
        'RETRYING',
        'BOUNCED',
        'COMPLAINED',
        'DELIVERED',
    ]),
    timestamp: zod_1.z.string().datetime(),
    metadata: zod_1.z.record(zod_1.z.any()).nullable(),
}).strict();
exports.emailDetailResponseSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    companyId: zod_1.z.string().uuid(),
    status: zod_1.z.nativeEnum(EmailStatusFilter),
    to: zod_1.z.string().email(),
    cc: zod_1.z.array(zod_1.z.string().email()),
    bcc: zod_1.z.array(zod_1.z.string().email()),
    subject: zod_1.z.string(),
    recipient: exports.recipientResponseSchema.nullable(),
    externalId: zod_1.z.string().nullable(),
    sesMessageId: zod_1.z.string().nullable(),
    attempts: zod_1.z.number().int().min(0),
    requestId: zod_1.z.string().nullable(),
    tags: zod_1.z.array(zod_1.z.string()),
    errorCode: zod_1.z.string().nullable(),
    errorReason: zod_1.z.string().nullable(),
    durationMs: zod_1.z.number().int().nullable(),
    createdAt: zod_1.z.string().datetime(),
    enqueuedAt: zod_1.z.string().datetime().nullable(),
    sentAt: zod_1.z.string().datetime().nullable(),
    failedAt: zod_1.z.string().datetime().nullable(),
    events: zod_1.z.array(exports.emailEventResponseSchema),
}).strict();
function parseSortParam(sort) {
    const parts = sort.split(':');
    const field = parts[0];
    const direction = parts[1];
    if (!field) {
        throw new Error('Sort field is required');
    }
    return {
        field,
        direction: (direction || 'asc'),
    };
}
function encodeCursor(data) {
    return Buffer.from(JSON.stringify(data)).toString('base64');
}
function decodeCursor(cursor) {
    try {
        return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    }
    catch {
        throw new Error('Invalid cursor format');
    }
}
//# sourceMappingURL=email-query.schema.js.map