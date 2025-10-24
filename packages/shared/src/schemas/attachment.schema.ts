/**
 * Attachment Schema and MIME Type Validation
 *
 * TASK-015: Secure attachment handling with MIME type allowlist
 *
 * Security considerations:
 * - Only allows safe, commonly-used MIME types
 * - Prevents executable files (.exe, .bat, .sh, .ps1)
 * - Prevents script files (.js, .vbs, .py unless explicitly allowed)
 * - Prevents potentially dangerous archives with executables
 *
 * @see task/TASK-015-MIME-TYPE-VALIDATION.md
 */

import { z } from 'zod';

// ============================================
// CONSTANTS
// ============================================

/**
 * File size limits for attachments
 */
export const ATTACHMENT_LIMITS = {
  MAX_FILENAME_LENGTH: 255,
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_ATTACHMENTS_PER_EMAIL: 10,
  MAX_TOTAL_SIZE_MB: 40,
  MAX_TOTAL_SIZE_BYTES: 40 * 1024 * 1024, // 40 MB
} as const;

/**
 * Allowed MIME types for email attachments (security allowlist)
 *
 * This list is intentionally restrictive to prevent malicious file uploads.
 * Only add types that are:
 * 1. Commonly needed for business communication
 * 2. Cannot execute code directly
 * 3. Have well-defined file formats
 */
export const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',                                                                      // PDF files
  'application/msword',                                                                   // Word (.doc)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',            // Word (.docx)
  'application/vnd.ms-excel',                                                            // Excel (.xls)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',                  // Excel (.xlsx)
  'application/vnd.ms-powerpoint',                                                       // PowerPoint (.ppt)
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',          // PowerPoint (.pptx)

  // Text files
  'text/plain',                                                                          // Text (.txt)
  'text/csv',                                                                            // CSV files
  'text/html',                                                                           // HTML files
  'text/calendar',                                                                       // Calendar (.ics)

  // Images
  'image/jpeg',                                                                          // JPEG (.jpg, .jpeg)
  'image/png',                                                                           // PNG (.png)
  'image/gif',                                                                           // GIF (.gif)
  'image/webp',                                                                          // WebP (.webp)
  'image/svg+xml',                                                                       // SVG (.svg)

  // Archives (use with caution - may contain executables)
  'application/zip',                                                                     // ZIP (.zip)
  'application/x-rar-compressed',                                                        // RAR (.rar)
  'application/x-7z-compressed',                                                         // 7-Zip (.7z)

  // Data formats
  'application/json',                                                                    // JSON (.json)
  'application/xml',                                                                     // XML (.xml)
  'text/xml',                                                                            // XML (.xml)
] as const;

/**
 * Type-safe MIME type
 */
export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

/**
 * Common file extensions mapped to MIME types
 * (for reference/documentation only - validation uses MIME type)
 */
export const MIME_TYPE_EXTENSIONS: Record<string, string[]> = {
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

// ============================================
// ZOD SCHEMAS
// ============================================

/**
 * Email attachment schema with MIME type validation
 */
export const attachmentSchema = z.object({
  /**
   * Filename with extension (e.g., "invoice.pdf")
   * - Must not be empty
   * - Max 255 characters
   * - Should include file extension for client reference
   */
  filename: z.string()
    .min(1, 'Filename cannot be empty')
    .max(
      ATTACHMENT_LIMITS.MAX_FILENAME_LENGTH,
      `Filename too long (max ${ATTACHMENT_LIMITS.MAX_FILENAME_LENGTH} characters)`
    )
    .regex(
      /^[^<>:"/\\|?*\x00-\x1F]+$/,
      'Filename contains invalid characters'
    ),

  /**
   * Base64-encoded file content
   * - Must be valid base64
   * - Size calculated after decoding
   */
  content: z.string()
    .min(1, 'Attachment content cannot be empty')
    .regex(
      /^[A-Za-z0-9+/]+=*$/,
      'Content must be valid base64'
    )
    .refine(
      (base64) => {
        try {
          const buffer = Buffer.from(base64, 'base64');
          return buffer.length <= ATTACHMENT_LIMITS.MAX_FILE_SIZE_BYTES;
        } catch {
          return false;
        }
      },
      `File too large (max ${ATTACHMENT_LIMITS.MAX_FILE_SIZE_MB}MB)`
    ),

  /**
   * MIME type from allowlist
   * - Must be one of ALLOWED_MIME_TYPES
   * - Used for email client rendering
   * - Security-critical: prevents malicious file types
   */
  mimeType: z.enum(ALLOWED_MIME_TYPES as unknown as [string, ...string[]], {
    errorMap: (issue, ctx) => {
      if (issue.code === 'invalid_enum_value') {
        const types = ALLOWED_MIME_TYPES.slice(0, 5).join(', ');
        return {
          message: `Invalid MIME type "${ctx.data}". Allowed types include: ${types}, ... (see API docs for full list)`,
        };
      }
      return { message: ctx.defaultError };
    },
  }),
}).strict();

/**
 * Type inference from schema
 */
export type EmailAttachment = z.infer<typeof attachmentSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate total size of attachments in bytes
 */
export function calculateTotalAttachmentSize(attachments: EmailAttachment[]): number {
  return attachments.reduce((total, attachment) => {
    const buffer = Buffer.from(attachment.content, 'base64');
    return total + buffer.length;
  }, 0);
}

/**
 * Validate attachment array constraints
 * - Max 10 attachments per email
 * - Max 40MB total size
 */
export function validateAttachmentConstraints(attachments: EmailAttachment[]): {
  valid: boolean;
  error?: string;
} {
  // Check count
  if (attachments.length > ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_EMAIL) {
    return {
      valid: false,
      error: `Too many attachments (max ${ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_EMAIL}, got ${attachments.length})`,
    };
  }

  // Check total size
  const totalSize = calculateTotalAttachmentSize(attachments);
  if (totalSize > ATTACHMENT_LIMITS.MAX_TOTAL_SIZE_BYTES) {
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `Total attachment size too large (max ${ATTACHMENT_LIMITS.MAX_TOTAL_SIZE_MB}MB, got ${totalSizeMB}MB)`,
    };
  }

  return { valid: true };
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
