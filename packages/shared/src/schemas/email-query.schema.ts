/**
 * Email Query Schemas
 *
 * Zod schemas for validating query parameters for GET /v1/emails endpoints
 * Includes filters, pagination, sorting, and response validation
 *
 * @see docs/api/04-email-get-contract.md
 */

import { z } from 'zod';

// ============================================
// CONSTANTS
// ============================================

export const QUERY_LIMITS = {
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MIN_PAGE: 1,
  CURSOR_EXPIRATION_HOURS: 24,
  MAX_FILTERS: 10,
} as const;

export const SORTABLE_FIELDS = [
  'createdAt',
  'sentAt',
  'status',
  'to',
] as const;

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

// ============================================
// ENUMS
// ============================================

export enum EmailStatusFilter {
  PENDING = 'PENDING',
  ENQUEUED = 'ENQUEUED',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

// ============================================
// HELPER SCHEMAS
// ============================================

/**
 * ISO 8601 DateTime string
 */
export const isoDateTimeSchema = z.string()
  .datetime({ message: 'Must be a valid ISO 8601 datetime string' })
  .describe('ISO 8601 datetime (e.g., 2025-10-19T14:30:00.000Z)');

/**
 * Email address (basic RFC validation)
 */
export const emailFilterSchema = z.string()
  .email({ message: 'Must be a valid email address' })
  .max(254)
  .transform((val) => val.toLowerCase().trim());

/**
 * CPF/CNPJ (digits only)
 * Will be hashed before querying database
 */
export const cpfCnpjFilterSchema = z.string()
  .regex(/^\d+$/, 'CPF/CNPJ must contain only digits')
  .refine(
    (val) => val.length === 11 || val.length === 14,
    'CPF must have 11 digits, CNPJ must have 14 digits'
  )
  .describe('CPF (11 digits) or CNPJ (14 digits), digits only');

/**
 * External ID (alphanumeric + hyphens/underscores)
 */
export const externalIdFilterSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'External ID must be alphanumeric with hyphens/underscores only')
  .transform((val) => val.trim());

/**
 * Name/Razão Social (partial match, case-insensitive)
 */
export const nameFilterSchema = z.string()
  .min(1)
  .max(150)
  .transform((val) => val.trim());

/**
 * Tags (comma-separated or array)
 */
export const tagsFilterSchema = z.union([
  z.string().transform((val) => val.split(',').map((t) => t.trim()).filter(Boolean)),
  z.array(z.string()),
]);

// ============================================
// PAGINATION SCHEMAS
// ============================================

/**
 * Offset-based pagination
 */
export const offsetPaginationSchema = z.object({
  page: z.coerce.number()
    .int()
    .min(QUERY_LIMITS.MIN_PAGE, `Page must be >= ${QUERY_LIMITS.MIN_PAGE}`)
    .default(QUERY_LIMITS.MIN_PAGE)
    .describe('Page number (1-indexed)'),

  pageSize: z.coerce.number()
    .int()
    .min(QUERY_LIMITS.MIN_PAGE_SIZE, `Page size must be >= ${QUERY_LIMITS.MIN_PAGE_SIZE}`)
    .max(QUERY_LIMITS.MAX_PAGE_SIZE, `Page size must be <= ${QUERY_LIMITS.MAX_PAGE_SIZE}`)
    .default(QUERY_LIMITS.DEFAULT_PAGE_SIZE)
    .describe('Number of items per page'),
}).strict();

/**
 * Cursor-based pagination
 */
export const cursorPaginationSchema = z.object({
  cursor: z.string()
    .optional()
    .describe('Opaque cursor for pagination (base64 encoded)'),

  pageSize: z.coerce.number()
    .int()
    .min(QUERY_LIMITS.MIN_PAGE_SIZE)
    .max(QUERY_LIMITS.MAX_PAGE_SIZE)
    .default(QUERY_LIMITS.DEFAULT_PAGE_SIZE),
}).strict();

/**
 * Combined pagination (offset or cursor, not both)
 */
export const paginationSchema = z.union([
  offsetPaginationSchema,
  cursorPaginationSchema,
]).refine(
  (data) => {
    // Cannot use both 'page' and 'cursor'
    return !('page' in data && 'cursor' in data);
  },
  { message: 'Cannot use both offset (page) and cursor pagination' }
);

// ============================================
// SORTING SCHEMA
// ============================================

/**
 * Sort parameter: field:direction
 * Example: createdAt:desc
 */
export const sortSchema = z.string()
  .regex(/^[a-zA-Z]+:(asc|desc)$/, 'Sort must be in format: field:direction')
  .refine(
    (val) => {
      const [field] = val.split(':');
      return SORTABLE_FIELDS.includes(field as any);
    },
    {
      message: `Sortable fields: ${SORTABLE_FIELDS.join(', ')}`,
    }
  )
  .default('createdAt:desc')
  .describe('Sort field and direction (e.g., createdAt:desc)');

// ============================================
// FILTERS SCHEMA
// ============================================

/**
 * All available filters for GET /v1/emails
 */
export const emailFiltersSchema = z.object({
  // Status filter
  status: z.union([
    z.nativeEnum(EmailStatusFilter),
    z.string().transform((val) => val.split(',').map((s) => s.trim() as EmailStatusFilter)),
  ]).optional()
    .describe('Filter by email status'),

  // Date range filters
  dateFrom: isoDateTimeSchema.optional()
    .describe('Start date (inclusive)'),

  dateTo: isoDateTimeSchema.optional()
    .describe('End date (inclusive)'),

  // Recipient filters
  to: emailFilterSchema.optional()
    .describe('Filter by recipient email address'),

  recipientExternalId: externalIdFilterSchema.optional()
    .describe('Filter by recipient external ID'),

  cpfCnpj: cpfCnpjFilterSchema.optional()
    .describe('Filter by recipient CPF/CNPJ'),

  razaoSocial: nameFilterSchema.optional()
    .describe('Filter by recipient razão social (partial match)'),

  nome: nameFilterSchema.optional()
    .describe('Filter by recipient nome (partial match)'),

  // Send filters
  externalId: externalIdFilterSchema.optional()
    .describe('Filter by send external ID'),

  tags: tagsFilterSchema.optional()
    .describe('Filter by tags (comma-separated or array)'),
}).strict();

// ============================================
// COMPLETE QUERY PARAMS SCHEMA
// ============================================

/**
 * Complete query parameters schema for GET /v1/emails
 * Combines filters, pagination, and sorting
 */
export const emailListQuerySchema = emailFiltersSchema.merge(z.object({
  // Pagination
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(QUERY_LIMITS.MAX_PAGE_SIZE).optional(),
  cursor: z.string().optional(),

  // Sorting
  sort: sortSchema.optional(),
})).refine(
  (data) => !('page' in data && 'cursor' in data),
  { message: 'Cannot use both offset (page) and cursor pagination' }
);

/**
 * Path params schema for GET /v1/emails/:id
 */
export const emailByIdParamsSchema = z.object({
  id: z.string()
    .uuid({ message: 'ID must be a valid UUID' })
    .describe('Email ID (UUID)'),
}).strict();

// ============================================
// RESPONSE SCHEMAS
// ============================================

/**
 * Pagination metadata for offset-based pagination
 */
export const offsetPaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(QUERY_LIMITS.MAX_PAGE_SIZE),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
}).strict();

/**
 * Pagination metadata for cursor-based pagination
 */
export const cursorPaginationMetaSchema = z.object({
  cursor: z.object({
    next: z.string().nullable(),
    prev: z.string().nullable(),
  }).strict(),
}).strict();

/**
 * Combined pagination metadata
 */
export const paginationMetaSchema = z.union([
  offsetPaginationMetaSchema,
  offsetPaginationMetaSchema.merge(cursorPaginationMetaSchema),
]);

/**
 * Email list item (summary for list view)
 */
export const emailListItemSchema = z.object({
  id: z.string().uuid(),
  status: z.nativeEnum(EmailStatusFilter),
  to: z.string().email(),
  subject: z.string(),
  recipientName: z.string().nullable(),
  recipientExternalId: z.string().nullable(),
  externalId: z.string().nullable(),
  attempts: z.number().int().min(0),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
}).strict();

/**
 * Email list response
 */
export const emailListResponseSchema = z.object({
  data: z.array(emailListItemSchema),
  pagination: paginationMetaSchema,
}).strict();

/**
 * Recipient data (with masked CPF/CNPJ)
 */
export const recipientResponseSchema = z.object({
  id: z.string(),
  externalId: z.string().nullable(),
  nome: z.string().nullable(),
  razaoSocial: z.string().nullable(),
  email: z.string().email(),
  cpfCnpj: z.string().nullable(), // Always masked
}).strict();

/**
 * Email event
 */
export const emailEventResponseSchema = z.object({
  id: z.string(),
  type: z.enum([
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
  timestamp: z.string().datetime(),
  metadata: z.record(z.any()).nullable(),
}).strict();

/**
 * Email detail (full view)
 */
export const emailDetailResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  status: z.nativeEnum(EmailStatusFilter),
  to: z.string().email(),
  cc: z.array(z.string().email()),
  bcc: z.array(z.string().email()),
  subject: z.string(),
  recipient: recipientResponseSchema.nullable(),
  externalId: z.string().nullable(),
  sesMessageId: z.string().nullable(),
  attempts: z.number().int().min(0),
  requestId: z.string().nullable(),
  tags: z.array(z.string()),
  errorCode: z.string().nullable(),
  errorReason: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  enqueuedAt: z.string().datetime().nullable(),
  sentAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  events: z.array(emailEventResponseSchema),
}).strict();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse sort string into field and direction
 */
export function parseSortParam(sort: string): { field: string; direction: 'asc' | 'desc' } {
  const [field, direction] = sort.split(':');
  return {
    field,
    direction: direction as 'asc' | 'desc',
  };
}

/**
 * Encode cursor (base64)
 */
export function encodeCursor(data: Record<string, any>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Decode cursor (base64)
 */
export function decodeCursor(cursor: string): Record<string, any> {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
  } catch {
    throw new Error('Invalid cursor format');
  }
}

// maskCpfCnpj is exported from email-send.schema.ts
// Import it when needed: import { maskCpfCnpj } from './email-send.schema';

// ============================================
// TYPE EXPORTS (for TypeScript)
// ============================================

export type EmailFilters = z.infer<typeof emailFiltersSchema>;
export type EmailListQuery = z.infer<typeof emailListQuerySchema>;
export type EmailByIdParams = z.infer<typeof emailByIdParamsSchema>;
export type OffsetPaginationMeta = z.infer<typeof offsetPaginationMetaSchema>;
export type CursorPaginationMeta = z.infer<typeof cursorPaginationMetaSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type EmailListItem = z.infer<typeof emailListItemSchema>;
export type EmailListResponse = z.infer<typeof emailListResponseSchema>;
export type RecipientResponse = z.infer<typeof recipientResponseSchema>;
export type EmailEventResponse = z.infer<typeof emailEventResponseSchema>;
export type EmailDetailResponse = z.infer<typeof emailDetailResponseSchema>;
