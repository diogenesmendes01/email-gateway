/**
 * @email-gateway/database
 *
 * Database client and utilities
 */

export * from './client';

// Re-export Prisma types and client
export type { Prisma } from '@prisma/client';
export { PrismaClient } from '@prisma/client';
