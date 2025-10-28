/**
 * @email-gateway/shared
 *
 * Shared utilities, schemas, types and constants
 */

// Schemas
export * from './schemas/email-send.schema';
export * from './schemas/email-send.types';
export * from './schemas/email-query.schema';
export * from './schemas/email-job.schema';
export * from './schemas/email-job.types';
export * from './schemas/email-job-retry.schema';
export * from './schemas/email-job-retry.types';
export * from './schemas/attachment.schema'; // TASK-015

// Types
export * from './types/email-pipeline.types';
export * from './types/domain.types';
export * from './types/test-utils.types'; // TASK-022

// Services
export * from './services/domain-management.service';
export * from './services/domain-warmup.service'; // TASK-016

// Utils
export * from './utils/masking.util';
export * from './utils/encryption.util';
export * from './utils/key-validation.util';
export * from './utils/retention.util';
export * from './utils/access-control.util';
export * from './utils/html-sanitization.util';

// Constants (quando criados)
// export * from './constants';
