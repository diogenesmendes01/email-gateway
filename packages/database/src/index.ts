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
  EmailProvider,
} from '@prisma/client';
