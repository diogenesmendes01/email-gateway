/**
 * TASK-025: Batch Email Controller
 *
 * REST API endpoints for batch email operations:
 * - POST /v1/email/batch - Send batch of emails
 * - GET /v1/email/batch/:batchId - Get batch status
 * - GET /v1/email/batch/:batchId/emails - List emails in batch
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeyOnly } from '../../auth/decorators';
import { BatchEmailService } from '../services/batch-email.service';
import {
  BatchEmailDto,
  BatchStatusResponseDto,
  BatchCreateResponseDto,
} from '../dto/email-batch.dto';

@Controller('v1/email')
@ApiTags('Batch Emails')
@ApiBearerAuth('X-API-Key')
export class BatchEmailController {
  constructor(private readonly batchEmailService: BatchEmailService) {}

  /**
   * POST /v1/email/batch
   * Send batch of emails (up to 1000)
   */
  @Post('batch')
  @ApiKeyOnly()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Send batch of emails',
    description:
      'Send multiple emails in a single request (up to 1000). Batch is processed asynchronously.',
  })
  @ApiResponse({
    status: 202,
    description: 'Batch accepted for processing',
    type: BatchCreateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid batch (validation failed or too many emails)',
  })
  async sendBatch(
    @Body() dto: BatchEmailDto,
    @Request() req: any
  ): Promise<BatchCreateResponseDto> {
    const companyId = req.user?.companyId || req.companyId;
    const requestId = req.headers['x-request-id'];

    return this.batchEmailService.createBatch(companyId, dto, requestId);
  }

  /**
   * GET /v1/email/batch/:batchId
   * Get batch status and progress
   */
  @Get('batch/:batchId')
  @ApiKeyOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get batch status',
    description: 'Get status, progress, and statistics for a batch',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch status retrieved successfully',
    type: BatchStatusResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Batch not found',
  })
  async getBatchStatus(
    @Param('batchId') batchId: string,
    @Request() req: any
  ): Promise<BatchStatusResponseDto> {
    const companyId = req.user?.companyId || req.companyId;

    return this.batchEmailService.getBatchStatus(companyId, batchId);
  }

  /**
   * GET /v1/email/batch/:batchId/emails
   * List emails in batch with their status
   */
  @Get('batch/:batchId/emails')
  @ApiKeyOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List emails in batch',
    description: 'Get list of emails in batch with their individual status',
  })
  @ApiResponse({
    status: 200,
    description: 'Emails list retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Batch not found',
  })
  async getBatchEmails(@Param('batchId') batchId: string, @Request() req: any) {
    const companyId = req.user?.companyId || req.companyId;

    return this.batchEmailService.getBatchEmails(companyId, batchId);
  }
}
