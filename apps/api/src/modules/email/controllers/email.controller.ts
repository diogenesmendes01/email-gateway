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
import { ApiKeyOnly, Company } from '../../auth/decorators';

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
    @Company() companyId: string,
  ): Promise<EmailListResponse> {
    // Validate query parameters using Zod
    const validatedQuery = emailListQuerySchema.parse(query);

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
    @Company() companyId: string,
  ): Promise<EmailDetailResponse> {
    // Validate path parameters using Zod
    const validatedParams = emailByIdParamsSchema.parse(params);

    // Call service to fetch email details
    return this.emailService.getEmailById(companyId, validatedParams.id);
  }

  /**
   * GET /v1/emails/:id/events
   *
   * Get all events for a specific email (TASK-024)
   * Events include: BOUNCED, COMPLAINED, DELIVERED, SENT, etc.
   *
   * @param params - Path parameters (email ID)
   * @param req - Request object (contains company info from auth)
   * @returns List of email events with timestamps and metadata
   */
  @Get(':id/events')
  @ApiKeyOnly()
  @HttpCode(HttpStatus.OK)
  async getEmailEvents(
    @Param() params: EmailByIdParams,
    @Company() companyId: string,
  ) {
    // Validate path parameters
    const validatedParams = emailByIdParamsSchema.parse(params);

    // Call service to fetch email events
    return this.emailService.getEmailEvents(companyId, validatedParams.id);
  }
}
