import { z } from 'zod';
export declare const QUERY_LIMITS: {
    readonly MAX_PAGE_SIZE: 100;
    readonly MIN_PAGE_SIZE: 1;
    readonly DEFAULT_PAGE_SIZE: 20;
    readonly MIN_PAGE: 1;
    readonly CURSOR_EXPIRATION_HOURS: 24;
    readonly MAX_FILTERS: 10;
};
export declare const SORTABLE_FIELDS: readonly ["createdAt", "sentAt", "status", "to"];
export declare const SORT_DIRECTIONS: readonly ["asc", "desc"];
export declare enum EmailStatusFilter {
    PENDING = "PENDING",
    ENQUEUED = "ENQUEUED",
    PROCESSING = "PROCESSING",
    SENT = "SENT",
    FAILED = "FAILED",
    RETRYING = "RETRYING"
}
export declare const isoDateTimeSchema: z.ZodString;
export declare const emailFilterSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const cpfCnpjFilterSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const externalIdFilterSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const nameFilterSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const tagsFilterSchema: z.ZodUnion<[z.ZodEffects<z.ZodString, string[], string>, z.ZodArray<z.ZodString, "many">]>;
export declare const offsetPaginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    page: number;
    pageSize: number;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export declare const cursorPaginationSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    pageSize: number;
    cursor?: string | undefined;
}, {
    pageSize?: number | undefined;
    cursor?: string | undefined;
}>;
export declare const paginationSchema: z.ZodEffects<z.ZodUnion<[z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    page: number;
    pageSize: number;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
}>, z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    pageSize: number;
    cursor?: string | undefined;
}, {
    pageSize?: number | undefined;
    cursor?: string | undefined;
}>]>, {
    page: number;
    pageSize: number;
} | {
    pageSize: number;
    cursor?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
} | {
    pageSize?: number | undefined;
    cursor?: string | undefined;
}>;
export declare const sortSchema: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
export declare const emailFiltersSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodUnion<[z.ZodNativeEnum<typeof EmailStatusFilter>, z.ZodEffects<z.ZodString, EmailStatusFilter[], string>]>>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    recipientExternalId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    cpfCnpj: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    razaoSocial: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    nome: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    externalId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    tags: z.ZodOptional<z.ZodUnion<[z.ZodEffects<z.ZodString, string[], string>, z.ZodArray<z.ZodString, "many">]>>;
}, "strict", z.ZodTypeAny, {
    status?: EmailStatusFilter | EmailStatusFilter[] | undefined;
    externalId?: string | undefined;
    cpfCnpj?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    to?: string | undefined;
    tags?: string[] | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    recipientExternalId?: string | undefined;
}, {
    status?: string | undefined;
    externalId?: string | undefined;
    cpfCnpj?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    to?: string | undefined;
    tags?: string | string[] | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    recipientExternalId?: string | undefined;
}>;
export declare const emailListQuerySchema: z.ZodEffects<z.ZodObject<{
    status: z.ZodOptional<z.ZodUnion<[z.ZodNativeEnum<typeof EmailStatusFilter>, z.ZodEffects<z.ZodString, EmailStatusFilter[], string>]>>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    recipientExternalId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    cpfCnpj: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    razaoSocial: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    nome: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    externalId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    tags: z.ZodOptional<z.ZodUnion<[z.ZodEffects<z.ZodString, string[], string>, z.ZodArray<z.ZodString, "many">]>>;
} & {
    page: z.ZodOptional<z.ZodNumber>;
    pageSize: z.ZodOptional<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>>;
}, "strip", z.ZodTypeAny, {
    status?: EmailStatusFilter | EmailStatusFilter[] | undefined;
    sort?: string | undefined;
    externalId?: string | undefined;
    cpfCnpj?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    to?: string | undefined;
    tags?: string[] | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    cursor?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    recipientExternalId?: string | undefined;
}, {
    status?: string | undefined;
    sort?: string | undefined;
    externalId?: string | undefined;
    cpfCnpj?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    to?: string | undefined;
    tags?: string | string[] | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    cursor?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    recipientExternalId?: string | undefined;
}>, {
    status?: EmailStatusFilter | EmailStatusFilter[] | undefined;
    sort?: string | undefined;
    externalId?: string | undefined;
    cpfCnpj?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    to?: string | undefined;
    tags?: string[] | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    cursor?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    recipientExternalId?: string | undefined;
}, {
    status?: string | undefined;
    sort?: string | undefined;
    externalId?: string | undefined;
    cpfCnpj?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    to?: string | undefined;
    tags?: string | string[] | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    cursor?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    recipientExternalId?: string | undefined;
}>;
export declare const emailByIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const offsetPaginationMetaSchema: z.ZodObject<{
    page: z.ZodNumber;
    pageSize: z.ZodNumber;
    totalItems: z.ZodNumber;
    totalPages: z.ZodNumber;
    hasNext: z.ZodBoolean;
    hasPrev: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}, {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}>;
export declare const cursorPaginationMetaSchema: z.ZodObject<{
    cursor: z.ZodObject<{
        next: z.ZodNullable<z.ZodString>;
        prev: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        next: string | null;
        prev: string | null;
    }, {
        next: string | null;
        prev: string | null;
    }>;
}, "strict", z.ZodTypeAny, {
    cursor: {
        next: string | null;
        prev: string | null;
    };
}, {
    cursor: {
        next: string | null;
        prev: string | null;
    };
}>;
export declare const paginationMetaSchema: z.ZodUnion<[z.ZodObject<{
    page: z.ZodNumber;
    pageSize: z.ZodNumber;
    totalItems: z.ZodNumber;
    totalPages: z.ZodNumber;
    hasNext: z.ZodBoolean;
    hasPrev: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}, {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}>, z.ZodObject<{
    page: z.ZodNumber;
    pageSize: z.ZodNumber;
    totalItems: z.ZodNumber;
    totalPages: z.ZodNumber;
    hasNext: z.ZodBoolean;
    hasPrev: z.ZodBoolean;
} & {
    cursor: z.ZodObject<{
        next: z.ZodNullable<z.ZodString>;
        prev: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        next: string | null;
        prev: string | null;
    }, {
        next: string | null;
        prev: string | null;
    }>;
}, "strict", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    cursor: {
        next: string | null;
        prev: string | null;
    };
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}, {
    page: number;
    pageSize: number;
    cursor: {
        next: string | null;
        prev: string | null;
    };
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}>]>;
export declare const emailListItemSchema: z.ZodObject<{
    id: z.ZodString;
    status: z.ZodNativeEnum<typeof EmailStatusFilter>;
    to: z.ZodString;
    subject: z.ZodString;
    recipientName: z.ZodNullable<z.ZodString>;
    recipientExternalId: z.ZodNullable<z.ZodString>;
    externalId: z.ZodNullable<z.ZodString>;
    attempts: z.ZodNumber;
    tags: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodString;
    sentAt: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    status: EmailStatusFilter;
    externalId: string | null;
    to: string;
    subject: string;
    tags: string[];
    createdAt: string;
    sentAt: string | null;
    recipientExternalId: string | null;
    recipientName: string | null;
    attempts: number;
}, {
    id: string;
    status: EmailStatusFilter;
    externalId: string | null;
    to: string;
    subject: string;
    tags: string[];
    createdAt: string;
    sentAt: string | null;
    recipientExternalId: string | null;
    recipientName: string | null;
    attempts: number;
}>;
export declare const emailListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        status: z.ZodNativeEnum<typeof EmailStatusFilter>;
        to: z.ZodString;
        subject: z.ZodString;
        recipientName: z.ZodNullable<z.ZodString>;
        recipientExternalId: z.ZodNullable<z.ZodString>;
        externalId: z.ZodNullable<z.ZodString>;
        attempts: z.ZodNumber;
        tags: z.ZodArray<z.ZodString, "many">;
        createdAt: z.ZodString;
        sentAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        status: EmailStatusFilter;
        externalId: string | null;
        to: string;
        subject: string;
        tags: string[];
        createdAt: string;
        sentAt: string | null;
        recipientExternalId: string | null;
        recipientName: string | null;
        attempts: number;
    }, {
        id: string;
        status: EmailStatusFilter;
        externalId: string | null;
        to: string;
        subject: string;
        tags: string[];
        createdAt: string;
        sentAt: string | null;
        recipientExternalId: string | null;
        recipientName: string | null;
        attempts: number;
    }>, "many">;
    pagination: z.ZodUnion<[z.ZodObject<{
        page: z.ZodNumber;
        pageSize: z.ZodNumber;
        totalItems: z.ZodNumber;
        totalPages: z.ZodNumber;
        hasNext: z.ZodBoolean;
        hasPrev: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    }, {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    }>, z.ZodObject<{
        page: z.ZodNumber;
        pageSize: z.ZodNumber;
        totalItems: z.ZodNumber;
        totalPages: z.ZodNumber;
        hasNext: z.ZodBoolean;
        hasPrev: z.ZodBoolean;
    } & {
        cursor: z.ZodObject<{
            next: z.ZodNullable<z.ZodString>;
            prev: z.ZodNullable<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            next: string | null;
            prev: string | null;
        }, {
            next: string | null;
            prev: string | null;
        }>;
    }, "strict", z.ZodTypeAny, {
        page: number;
        pageSize: number;
        cursor: {
            next: string | null;
            prev: string | null;
        };
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    }, {
        page: number;
        pageSize: number;
        cursor: {
            next: string | null;
            prev: string | null;
        };
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    }>]>;
}, "strict", z.ZodTypeAny, {
    data: {
        id: string;
        status: EmailStatusFilter;
        externalId: string | null;
        to: string;
        subject: string;
        tags: string[];
        createdAt: string;
        sentAt: string | null;
        recipientExternalId: string | null;
        recipientName: string | null;
        attempts: number;
    }[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    } | {
        page: number;
        pageSize: number;
        cursor: {
            next: string | null;
            prev: string | null;
        };
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}, {
    data: {
        id: string;
        status: EmailStatusFilter;
        externalId: string | null;
        to: string;
        subject: string;
        tags: string[];
        createdAt: string;
        sentAt: string | null;
        recipientExternalId: string | null;
        recipientName: string | null;
        attempts: number;
    }[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    } | {
        page: number;
        pageSize: number;
        cursor: {
            next: string | null;
            prev: string | null;
        };
        totalItems: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
export declare const recipientResponseSchema: z.ZodObject<{
    id: z.ZodString;
    externalId: z.ZodNullable<z.ZodString>;
    nome: z.ZodNullable<z.ZodString>;
    razaoSocial: z.ZodNullable<z.ZodString>;
    email: z.ZodString;
    cpfCnpj: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    externalId: string | null;
    cpfCnpj: string | null;
    razaoSocial: string | null;
    nome: string | null;
    email: string;
}, {
    id: string;
    externalId: string | null;
    cpfCnpj: string | null;
    razaoSocial: string | null;
    nome: string | null;
    email: string;
}>;
export declare const emailEventResponseSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["CREATED", "ENQUEUED", "PROCESSING", "SENT", "FAILED", "RETRYING", "BOUNCED", "COMPLAINED", "DELIVERED"]>;
    timestamp: z.ZodString;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    type: "ENQUEUED" | "PROCESSING" | "SENT" | "FAILED" | "RETRYING" | "CREATED" | "BOUNCED" | "COMPLAINED" | "DELIVERED";
    timestamp: string;
    metadata: Record<string, any> | null;
}, {
    id: string;
    type: "ENQUEUED" | "PROCESSING" | "SENT" | "FAILED" | "RETRYING" | "CREATED" | "BOUNCED" | "COMPLAINED" | "DELIVERED";
    timestamp: string;
    metadata: Record<string, any> | null;
}>;
export declare const emailDetailResponseSchema: z.ZodObject<{
    id: z.ZodString;
    companyId: z.ZodString;
    status: z.ZodNativeEnum<typeof EmailStatusFilter>;
    to: z.ZodString;
    cc: z.ZodArray<z.ZodString, "many">;
    bcc: z.ZodArray<z.ZodString, "many">;
    subject: z.ZodString;
    recipient: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        externalId: z.ZodNullable<z.ZodString>;
        nome: z.ZodNullable<z.ZodString>;
        razaoSocial: z.ZodNullable<z.ZodString>;
        email: z.ZodString;
        cpfCnpj: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        externalId: string | null;
        cpfCnpj: string | null;
        razaoSocial: string | null;
        nome: string | null;
        email: string;
    }, {
        id: string;
        externalId: string | null;
        cpfCnpj: string | null;
        razaoSocial: string | null;
        nome: string | null;
        email: string;
    }>>;
    externalId: z.ZodNullable<z.ZodString>;
    sesMessageId: z.ZodNullable<z.ZodString>;
    attempts: z.ZodNumber;
    requestId: z.ZodNullable<z.ZodString>;
    tags: z.ZodArray<z.ZodString, "many">;
    errorCode: z.ZodNullable<z.ZodString>;
    errorReason: z.ZodNullable<z.ZodString>;
    durationMs: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodString;
    enqueuedAt: z.ZodNullable<z.ZodString>;
    sentAt: z.ZodNullable<z.ZodString>;
    failedAt: z.ZodNullable<z.ZodString>;
    events: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["CREATED", "ENQUEUED", "PROCESSING", "SENT", "FAILED", "RETRYING", "BOUNCED", "COMPLAINED", "DELIVERED"]>;
        timestamp: z.ZodString;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        type: "ENQUEUED" | "PROCESSING" | "SENT" | "FAILED" | "RETRYING" | "CREATED" | "BOUNCED" | "COMPLAINED" | "DELIVERED";
        timestamp: string;
        metadata: Record<string, any> | null;
    }, {
        id: string;
        type: "ENQUEUED" | "PROCESSING" | "SENT" | "FAILED" | "RETRYING" | "CREATED" | "BOUNCED" | "COMPLAINED" | "DELIVERED";
        timestamp: string;
        metadata: Record<string, any> | null;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    id: string;
    status: EmailStatusFilter;
    externalId: string | null;
    to: string;
    cc: string[];
    bcc: string[];
    subject: string;
    tags: string[];
    recipient: {
        id: string;
        externalId: string | null;
        cpfCnpj: string | null;
        razaoSocial: string | null;
        nome: string | null;
        email: string;
    } | null;
    requestId: string | null;
    createdAt: string;
    sentAt: string | null;
    attempts: number;
    companyId: string;
    sesMessageId: string | null;
    errorCode: string | null;
    errorReason: string | null;
    durationMs: number | null;
    enqueuedAt: string | null;
    failedAt: string | null;
    events: {
        id: string;
        type: "ENQUEUED" | "PROCESSING" | "SENT" | "FAILED" | "RETRYING" | "CREATED" | "BOUNCED" | "COMPLAINED" | "DELIVERED";
        timestamp: string;
        metadata: Record<string, any> | null;
    }[];
}, {
    id: string;
    status: EmailStatusFilter;
    externalId: string | null;
    to: string;
    cc: string[];
    bcc: string[];
    subject: string;
    tags: string[];
    recipient: {
        id: string;
        externalId: string | null;
        cpfCnpj: string | null;
        razaoSocial: string | null;
        nome: string | null;
        email: string;
    } | null;
    requestId: string | null;
    createdAt: string;
    sentAt: string | null;
    attempts: number;
    companyId: string;
    sesMessageId: string | null;
    errorCode: string | null;
    errorReason: string | null;
    durationMs: number | null;
    enqueuedAt: string | null;
    failedAt: string | null;
    events: {
        id: string;
        type: "ENQUEUED" | "PROCESSING" | "SENT" | "FAILED" | "RETRYING" | "CREATED" | "BOUNCED" | "COMPLAINED" | "DELIVERED";
        timestamp: string;
        metadata: Record<string, any> | null;
    }[];
}>;
export declare function parseSortParam(sort: string): {
    field: string;
    direction: 'asc' | 'desc';
};
export declare function encodeCursor(data: Record<string, any>): string;
export declare function decodeCursor(cursor: string): Record<string, any>;
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
