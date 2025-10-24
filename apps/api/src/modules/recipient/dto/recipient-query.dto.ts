/**
 * Recipient Query DTO
 *
 * Validates query parameters for listing recipients
 */

import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// CONSTANTS
// ============================================

/**
 * Pagination constraints for recipient queries
 */
export const RECIPIENT_QUERY_LIMITS = {
  MIN_SKIP: 0,
  MIN_LIMIT: 1,
  MAX_LIMIT: 100,
  DEFAULT_LIMIT: 20,
} as const;

export class RecipientQueryDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(RECIPIENT_QUERY_LIMITS.MIN_SKIP)
  skip: number = RECIPIENT_QUERY_LIMITS.MIN_SKIP;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(RECIPIENT_QUERY_LIMITS.MIN_LIMIT)
  @Max(RECIPIENT_QUERY_LIMITS.MAX_LIMIT)
  limit: number = RECIPIENT_QUERY_LIMITS.DEFAULT_LIMIT;
}
