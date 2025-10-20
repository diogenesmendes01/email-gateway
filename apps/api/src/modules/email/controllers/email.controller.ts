/**
 * Email Controller
 *
 * Handles HTTP endpoints for email operations:
 * - GET /v1/emails - List emails with filters and pagination
 * - GET /v1/emails/:id - Get email details by ID
 *
 * @see docs/api/04-email-get-contract.md
 */

import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { EmailService } from '../services/email.service';
import {
  emailListQuerySchema,
  emailByIdParamsSchema,
  EmailListResponse,
  EmailDetailResponse,
  EmailListQuery,
  EmailByIdParams,
} from '@email-gateway/shared';
import { ApiKeyOnly } from '../../auth/decorators';

@Controller('emails')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * GET /v1/emails
   *
   * List and filter emails with pagination
   *
   * @param query - Query parameters (filters, pagination, sorting)
   * @param req - Request object (contains company info from auth)
   * @returns Paginated list of emails
   */
  @Get()
  @ApiKeyOnly()
  @HttpCode(HttpStatus.OK)
  async listEmails(
    @Query() query: EmailListQuery,
    @Request() req: any,
  ): Promise<EmailListResponse> {
    // Validate query parameters using Zod
    const validatedQuery = emailListQuerySchema.parse(query);

    // Get company ID from authenticated request
    // TODO: Extract from API Key guard
    const companyId = req.user?.companyId || req.companyId;

    // Call service to fetch emails
    return this.emailService.listEmails(companyId, validatedQuery);
  }

  /**
   * GET /v1/emails/:id
   *
   * Get email details by ID
   *
   * @param params - Path parameters (email ID)
   * @param req - Request object (contains company info from auth)
   * @returns Email details with events
   */
  @Get(':id')
  @ApiKeyOnly()
  @HttpCode(HttpStatus.OK)
  async getEmailById(
    @Param() params: EmailByIdParams,
    @Request() req: any,
  ): Promise<EmailDetailResponse> {
    // Validate path parameters using Zod
    const validatedParams = emailByIdParamsSchema.parse(params);

    // Get company ID from authenticated request
    const companyId = req.user?.companyId || req.companyId;

    // Call service to fetch email details
    return this.emailService.getEmailById(companyId, validatedParams.id);
  }
}
