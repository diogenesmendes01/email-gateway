/**
 * Email Send Controller
 *
 * Handles HTTP endpoints for email sending:
 * - POST /v1/email/send - Send email asynchronously
 *
 * @see docs/api/03-email-send-contract.md
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Request,
  Headers,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EmailSendService } from '../services/email-send.service';
import {
  emailSendBodySchema,
  EmailSendBody,
  EmailSendResponse,
} from '@email-gateway/shared';
import { ApiProtected } from '../../auth/decorators';

@Controller('email')
export class EmailSendController {
  constructor(private readonly emailSendService: EmailSendService) {}

  /**
   * POST /v1/email/send
   *
   * Send email asynchronously (boleto)
   *
   * @param body - Email data (recipient, subject, html, etc.)
   * @param req - Request object (contains company info from auth)
   * @param headers - Request headers (idempotency key, request id)
   * @returns Email send response with tracking IDs
   */
  @Post('send')
  @ApiProtected() // API Key + Rate Limit + Audit
  @HttpCode(HttpStatus.ACCEPTED)
  async sendEmail(
    @Body() body: EmailSendBody,
    @Request() req: any,
    @Headers() headers: Record<string, string>,
  ): Promise<EmailSendResponse> {
    // Extract headers
    const idempotencyKey = headers['idempotency-key'];
    const requestId = headers['x-request-id'];

    // Validate request body using Zod
    const validatedBody = emailSendBodySchema.parse(body);

    // Get company ID from authenticated request
    const companyId = req.companyId;
    if (!companyId) {
      throw new BadRequestException('Company ID not found in request');
    }

    try {
      // Call service to send email
      const result = await this.emailSendService.sendEmail({
        companyId,
        body: validatedBody,
        idempotencyKey,
        requestId,
      });

      return result;
    } catch (error) {
      // Handle idempotency conflicts
      if ((error as any).code === 'IDEMPOTENCY_CONFLICT') {
        throw new ConflictException({
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Request conflicts with previous request with same idempotency key',
            requestId: requestId || 'unknown',
            timestamp: new Date().toISOString(),
            details: [
              {
                field: 'Idempotency-Key',
                message: 'A different request with the same idempotency key was already processed',
              },
            ],
          },
        });
      }

      // Re-throw other errors
      throw error;
    }
  }
}
