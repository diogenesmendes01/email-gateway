/**
 * @email-gateway/database
 *
 * Database client and utilities
 */

export * from './client';

// Re-export Prisma types, client and enums
export type { Prisma } from '@prisma/client';
export { 
  PrismaClient,
  DomainOnboardingStatus,
  IPPoolType,
  RateLimitScope,
  SuppressionReason,
} from '@prisma/client';

// EmailProvider enum (from schema)
// TODO: Verify if this enum exists in generated Prisma client
// export { EmailProvider } from '@prisma/client';
