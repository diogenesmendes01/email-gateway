import { z } from 'zod';
export declare const ATTACHMENT_LIMITS: {
    readonly MAX_FILENAME_LENGTH: 255;
    readonly MAX_FILE_SIZE_MB: 10;
    readonly MAX_FILE_SIZE_BYTES: number;
    readonly MAX_ATTACHMENTS_PER_EMAIL: 10;
    readonly MAX_TOTAL_SIZE_MB: 40;
    readonly MAX_TOTAL_SIZE_BYTES: number;
};
export declare const ALLOWED_MIME_TYPES: readonly ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv", "text/html", "text/calendar", "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "application/zip", "application/x-rar-compressed", "application/x-7z-compressed", "application/json", "application/xml", "text/xml"];
export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];
export declare const MIME_TYPE_EXTENSIONS: Record<string, string[]>;
export declare const attachmentSchema: z.ZodObject<{
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
}>;
export type EmailAttachment = z.infer<typeof attachmentSchema>;
export declare function calculateTotalAttachmentSize(attachments: EmailAttachment[]): number;
export declare function validateAttachmentConstraints(attachments: EmailAttachment[]): {
    valid: boolean;
    error?: string;
};
export declare function formatFileSize(bytes: number): string;
