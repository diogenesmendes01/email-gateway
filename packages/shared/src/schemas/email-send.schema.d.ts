import { z } from 'zod';
export declare const LIMITS: {
    readonly MAX_PAYLOAD_SIZE: 1048576;
    readonly MAX_HTML_SIZE: 1048576;
    readonly MAX_EMAIL_LENGTH: 254;
    readonly MAX_SUBJECT_LENGTH: 150;
    readonly MIN_SUBJECT_LENGTH: 1;
    readonly MAX_HEADER_KEY_LENGTH: 64;
    readonly MAX_HEADER_VALUE_LENGTH: 256;
    readonly MAX_TAG_LENGTH: 32;
    readonly MAX_EXTERNAL_ID_LENGTH: 64;
    readonly MIN_EXTERNAL_ID_LENGTH: 1;
    readonly MAX_IDEMPOTENCY_KEY_LENGTH: 128;
    readonly MAX_NOME_LENGTH: 120;
    readonly MIN_NOME_LENGTH: 1;
    readonly MAX_RAZAO_SOCIAL_LENGTH: 150;
    readonly MIN_RAZAO_SOCIAL_LENGTH: 1;
    readonly CPF_LENGTH: 11;
    readonly CNPJ_LENGTH: 14;
    readonly MAX_CC_COUNT: 5;
    readonly MAX_BCC_COUNT: 5;
    readonly MAX_TAGS_COUNT: 5;
    readonly MAX_HEADERS_COUNT: 10;
};
export declare const emailSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const externalIdSchema: z.ZodString;
export declare const tagSchema: z.ZodString;
export declare const cpfCnpjSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
export declare const recipientSchema: z.ZodObject<{
    externalId: z.ZodOptional<z.ZodString>;
    cpfCnpj: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
    razaoSocial: z.ZodOptional<z.ZodString>;
    nome: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strict", z.ZodTypeAny, {
    externalId?: string | undefined;
    cpfCnpj?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    email?: string | undefined;
}, {
    externalId?: string | undefined;
    cpfCnpj?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    email?: string | undefined;
}>;
export declare const customHeadersSchema: z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodString>, Record<string, string>, Record<string, string>>>;
export declare const emailSendBodySchema: z.ZodEffects<z.ZodObject<{
    to: z.ZodEffects<z.ZodString, string, string>;
    cc: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    bcc: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    subject: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    html: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    replyTo: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    headers: z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodString>, Record<string, string>, Record<string, string>>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    recipient: z.ZodOptional<z.ZodObject<{
        externalId: z.ZodOptional<z.ZodString>;
        cpfCnpj: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
        razaoSocial: z.ZodOptional<z.ZodString>;
        nome: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    }, "strict", z.ZodTypeAny, {
        externalId?: string | undefined;
        cpfCnpj?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        email?: string | undefined;
    }, {
        externalId?: string | undefined;
        cpfCnpj?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        email?: string | undefined;
    }>>;
    externalId: z.ZodOptional<z.ZodString>;
    attachments: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        content: z.ZodEffects<z.ZodString, string, string>;
        mimeType: z.ZodEnum<[string, ...string[]]>;
    }, "strict", z.ZodTypeAny, {
        filename: string;
        content: string;
        mimeType: string;
    }, {
        filename: string;
        content: string;
        mimeType: string;
    }>, "many">>, {
        filename: string;
        content: string;
        mimeType: string;
    }[] | undefined, {
        filename: string;
        content: string;
        mimeType: string;
    }[] | undefined>;
}, "strict", z.ZodTypeAny, {
    to: string;
    subject: string;
    html: string;
    externalId?: string | undefined;
    cc?: string[] | undefined;
    bcc?: string[] | undefined;
    replyTo?: string | undefined;
    headers?: Record<string, string> | undefined;
    tags?: string[] | undefined;
    recipient?: {
        externalId?: string | undefined;
        cpfCnpj?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        email?: string | undefined;
    } | undefined;
    attachments?: {
        filename: string;
        content: string;
        mimeType: string;
    }[] | undefined;
}, {
    to: string;
    subject: string;
    html: string;
    externalId?: string | undefined;
    cc?: string[] | undefined;
    bcc?: string[] | undefined;
    replyTo?: string | undefined;
    headers?: Record<string, string> | undefined;
    tags?: string[] | undefined;
    recipient?: {
        externalId?: string | undefined;
        cpfCnpj?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        email?: string | undefined;
    } | undefined;
    attachments?: {
        filename: string;
        content: string;
        mimeType: string;
    }[] | undefined;
}>, {
    to: string;
    subject: string;
    html: string;
    externalId?: string | undefined;
    cc?: string[] | undefined;
    bcc?: string[] | undefined;
    replyTo?: string | undefined;
    headers?: Record<string, string> | undefined;
    tags?: string[] | undefined;
    recipient?: {
        externalId?: string | undefined;
        cpfCnpj?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        email?: string | undefined;
    } | undefined;
    attachments?: {
        filename: string;
        content: string;
        mimeType: string;
    }[] | undefined;
}, {
    to: string;
    subject: string;
    html: string;
    externalId?: string | undefined;
    cc?: string[] | undefined;
    bcc?: string[] | undefined;
    replyTo?: string | undefined;
    headers?: Record<string, string> | undefined;
    tags?: string[] | undefined;
    recipient?: {
        externalId?: string | undefined;
        cpfCnpj?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        email?: string | undefined;
    } | undefined;
    attachments?: {
        filename: string;
        content: string;
        mimeType: string;
    }[] | undefined;
}>;
export declare const emailSendHeadersSchema: z.ZodObject<{
    'x-api-key': z.ZodString;
    'content-type': z.ZodEffects<z.ZodString, string, string>;
    'idempotency-key': z.ZodOptional<z.ZodString>;
    'x-request-id': z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    'x-api-key': z.ZodString;
    'content-type': z.ZodEffects<z.ZodString, string, string>;
    'idempotency-key': z.ZodOptional<z.ZodString>;
    'x-request-id': z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    'x-api-key': z.ZodString;
    'content-type': z.ZodEffects<z.ZodString, string, string>;
    'idempotency-key': z.ZodOptional<z.ZodString>;
    'x-request-id': z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const emailSendResponseSchema: z.ZodObject<{
    outboxId: z.ZodString;
    jobId: z.ZodString;
    requestId: z.ZodString;
    status: z.ZodLiteral<"ENQUEUED">;
    receivedAt: z.ZodString;
    recipient: z.ZodOptional<z.ZodObject<{
        externalId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        externalId?: string | undefined;
    }, {
        externalId?: string | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    status: "ENQUEUED";
    outboxId: string;
    jobId: string;
    requestId: string;
    receivedAt: string;
    recipient?: {
        externalId?: string | undefined;
    } | undefined;
}, {
    status: "ENQUEUED";
    outboxId: string;
    jobId: string;
    requestId: string;
    receivedAt: string;
    recipient?: {
        externalId?: string | undefined;
    } | undefined;
}>;
export declare const errorDetailSchema: z.ZodObject<{
    field: z.ZodString;
    message: z.ZodString;
    value: z.ZodOptional<z.ZodAny>;
}, "strict", z.ZodTypeAny, {
    message: string;
    field: string;
    value?: any;
}, {
    message: string;
    field: string;
    value?: any;
}>;
export declare const errorResponseSchema: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        requestId: z.ZodString;
        timestamp: z.ZodString;
        details: z.ZodOptional<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            message: z.ZodString;
            value: z.ZodOptional<z.ZodAny>;
        }, "strict", z.ZodTypeAny, {
            message: string;
            field: string;
            value?: any;
        }, {
            message: string;
            field: string;
            value?: any;
        }>, "many">>;
    }, "strict", z.ZodTypeAny, {
        code: string;
        message: string;
        requestId: string;
        timestamp: string;
        details?: {
            message: string;
            field: string;
            value?: any;
        }[] | undefined;
    }, {
        code: string;
        message: string;
        requestId: string;
        timestamp: string;
        details?: {
            message: string;
            field: string;
            value?: any;
        }[] | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    error: {
        code: string;
        message: string;
        requestId: string;
        timestamp: string;
        details?: {
            message: string;
            field: string;
            value?: any;
        }[] | undefined;
    };
}, {
    error: {
        code: string;
        message: string;
        requestId: string;
        timestamp: string;
        details?: {
            message: string;
            field: string;
            value?: any;
        }[] | undefined;
    };
}>;
export type EmailSendBody = z.infer<typeof emailSendBodySchema>;
export type EmailSendHeaders = z.infer<typeof emailSendHeadersSchema>;
export type EmailSendResponse = z.infer<typeof emailSendResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type Recipient = z.infer<typeof recipientSchema>;
export type CustomHeaders = z.infer<typeof customHeadersSchema>;
export declare function validatePayloadSize(payload: string): boolean;
export declare function normalizeCpfCnpj(cpfCnpj: string): string;
export declare function maskCpfCnpj(cpfCnpj: string): string;
export declare function hashCpfCnpj(cpfCnpj: string): Promise<string>;
export declare function sanitizeSubject(subject: string): string;
export declare function generateRequestId(): string;
