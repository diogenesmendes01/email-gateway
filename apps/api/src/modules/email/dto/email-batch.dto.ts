/**
 * TASK-025: Email Batch DTOs
 *
 * Data Transfer Objects for batch email operations
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Re-use existing EmailSendBody from shared package
// For now, use a simplified interface
interface EmailSendInput {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: string[];
  externalId?: string;
  recipient?: {
    email: string;
    nome?: string;
    cpfCnpj?: string;
    razaoSocial?: string;
    externalId?: string;
  };
}

export class BatchEmailDto {
  @ApiProperty({
    description: 'Array of emails to send in batch',
    type: 'array',
    minItems: 1,
    maxItems: 1000,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Batch must contain at least 1 email' })
  @ArrayMaxSize(1000, { message: 'Batch cannot exceed 1000 emails' })
  emails!: EmailSendInput[];

  @ApiProperty({
    description: 'Processing mode',
    enum: ['all_or_nothing', 'best_effort'],
    default: 'best_effort',
  })
  @IsOptional()
  @IsEnum(['all_or_nothing', 'best_effort'])
  mode?: 'all_or_nothing' | 'best_effort' = 'best_effort';
}

export class BatchStatusResponseDto {
  @ApiProperty({ description: 'Batch ID' })
  batchId!: string;

  @ApiProperty({ description: 'Batch status' })
  status!: string;

  @ApiProperty({ description: 'Total emails in batch' })
  totalEmails!: number;

  @ApiProperty({ description: 'Number of processed emails' })
  processedCount!: number;

  @ApiProperty({ description: 'Number of successful emails' })
  successCount!: number;

  @ApiProperty({ description: 'Number of failed emails' })
  failedCount!: number;

  @ApiProperty({ description: 'Progress percentage (0-100)' })
  progress!: number;

  @ApiProperty({ description: 'Batch creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Batch completion timestamp', required: false })
  completedAt?: Date;
}

export class BatchCreateResponseDto {
  @ApiProperty({ description: 'Batch ID' })
  batchId!: string;

  @ApiProperty({ description: 'Batch status' })
  status!: string;

  @ApiProperty({ description: 'Total emails accepted' })
  totalEmails!: number;

  @ApiProperty({ description: 'Response message' })
  message!: string;
}
