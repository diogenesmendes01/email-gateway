"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachmentSchema = exports.MIME_TYPE_EXTENSIONS = exports.ALLOWED_MIME_TYPES = exports.ATTACHMENT_LIMITS = void 0;
exports.calculateTotalAttachmentSize = calculateTotalAttachmentSize;
exports.validateAttachmentConstraints = validateAttachmentConstraints;
exports.formatFileSize = formatFileSize;
const zod_1 = require("zod");
exports.ATTACHMENT_LIMITS = {
    MAX_FILENAME_LENGTH: 255,
    MAX_FILE_SIZE_MB: 10,
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
    MAX_ATTACHMENTS_PER_EMAIL: 10,
    MAX_TOTAL_SIZE_MB: 40,
    MAX_TOTAL_SIZE_BYTES: 40 * 1024 * 1024,
};
exports.ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/html',
    'text/calendar',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/json',
    'application/xml',
    'text/xml',
];
exports.MIME_TYPE_EXTENSIONS = {
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-powerpoint': ['.ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    'text/plain': ['.txt'],
    'text/csv': ['.csv'],
    'text/html': ['.html', '.htm'],
    'text/calendar': ['.ics'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],
    'application/zip': ['.zip'],
    'application/x-rar-compressed': ['.rar'],
    'application/x-7z-compressed': ['.7z'],
    'application/json': ['.json'],
    'application/xml': ['.xml'],
    'text/xml': ['.xml'],
};
exports.attachmentSchema = zod_1.z.object({
    filename: zod_1.z.string()
        .min(1, 'Filename cannot be empty')
        .max(exports.ATTACHMENT_LIMITS.MAX_FILENAME_LENGTH, `Filename too long (max ${exports.ATTACHMENT_LIMITS.MAX_FILENAME_LENGTH} characters)`)
        .regex(/^[^<>:"/\\|?*\x00-\x1F]+$/, 'Filename contains invalid characters'),
    content: zod_1.z.string()
        .min(1, 'Attachment content cannot be empty')
        .regex(/^[A-Za-z0-9+/]+=*$/, 'Content must be valid base64')
        .refine((base64) => {
        try {
            const buffer = Buffer.from(base64, 'base64');
            return buffer.length <= exports.ATTACHMENT_LIMITS.MAX_FILE_SIZE_BYTES;
        }
        catch {
            return false;
        }
    }, `File too large (max ${exports.ATTACHMENT_LIMITS.MAX_FILE_SIZE_MB}MB)`),
    mimeType: zod_1.z.enum(exports.ALLOWED_MIME_TYPES, {
        errorMap: (issue, ctx) => {
            if (issue.code === 'invalid_enum_value') {
                const types = exports.ALLOWED_MIME_TYPES.slice(0, 5).join(', ');
                return {
                    message: `Invalid MIME type "${ctx.data}". Allowed types include: ${types}, ... (see API docs for full list)`,
                };
            }
            return { message: ctx.defaultError };
        },
    }),
}).strict();
function calculateTotalAttachmentSize(attachments) {
    return attachments.reduce((total, attachment) => {
        const buffer = Buffer.from(attachment.content, 'base64');
        return total + buffer.length;
    }, 0);
}
function validateAttachmentConstraints(attachments) {
    if (attachments.length > exports.ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_EMAIL) {
        return {
            valid: false,
            error: `Too many attachments (max ${exports.ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_EMAIL}, got ${attachments.length})`,
        };
    }
    const totalSize = calculateTotalAttachmentSize(attachments);
    if (totalSize > exports.ATTACHMENT_LIMITS.MAX_TOTAL_SIZE_BYTES) {
        const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
        return {
            valid: false,
            error: `Total attachment size too large (max ${exports.ATTACHMENT_LIMITS.MAX_TOTAL_SIZE_MB}MB, got ${totalSizeMB}MB)`,
        };
    }
    return { valid: true };
}
function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
//# sourceMappingURL=attachment.schema.js.map